import os
import io
import time
import threading
import torch
import pynvml
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
import uvicorn
from prometheus_client import Gauge, Counter, Histogram, make_asgi_app
from opentelemetry import trace, propagate
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
from opentelemetry.sdk.resources import Resource, SERVICE_NAME
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from diffusers import AutoPipelineForText2Image, AutoPipelineForImage2Image
import requests
from PIL import Image

from storage import upload_image_to_s3
from logger import get_logger

logger = get_logger(__name__)

# Setup OpenTelemetry
resource = Resource(attributes={SERVICE_NAME: "python-worker"})
provider = TracerProvider(resource=resource)
try:
    processor = BatchSpanProcessor(CloudTraceSpanExporter())
except Exception as e:
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    processor = BatchSpanProcessor(OTLPSpanExporter(endpoint="http://localhost:4318/v1/traces"))
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)
tracer = trace.get_tracer(__name__)

# Prometheus Metrics
gpu_vram_used = Gauge('cloudllm_gpu_vram_used_bytes', 'GPU VRAM used in bytes')
gpu_vram_total = Gauge('cloudllm_gpu_vram_total_bytes', 'GPU VRAM total in bytes')
gpu_temperature = Gauge('cloudllm_gpu_temperature_celsius', 'GPU Temperature in Celsius')
gpu_utilization = Gauge('cloudllm_gpu_utilization_percent', 'GPU Utilization %')
gpu_power_usage = Gauge('cloudllm_gpu_power_usage_watts', 'GPU Power Usage in Watts')
gpu_clock_speed = Gauge('cloudllm_gpu_clock_speed_mhz', 'GPU Clock Speed in MHz')
worker_status = Gauge('cloudllm_gpu_worker_status', 'GPU Worker Status (0=Idle, 1=Busy)')

generations_total = Counter('cloudllm_generations_total', 'Total image generations', ['status'])
oom_errors_total = Counter('cloudllm_oom_errors_total', 'Total Out-Of-Memory errors')
generation_duration = Histogram(
    'cloudllm_generation_duration_seconds', 
    'Time taken to generate an image',
    buckets=(1.0, 2.5, 5.0, 7.5, 10.0, 15.0, 20.0, 30.0, 60.0)
)

# Initialize worker as idle
worker_status.set(0)

def collect_gpu_metrics():
    try:
        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        while True:
            info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            gpu_vram_used.set(info.used)
            gpu_vram_total.set(info.total)
            
            temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            gpu_temperature.set(temp)
            
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            gpu_utilization.set(util.gpu)
            
            # Power in milliwatts to watts
            power = pynvml.nvmlDeviceGetPowerUsage(handle)
            gpu_power_usage.set(power / 1000.0)
            
            clock = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_GRAPHICS)
            gpu_clock_speed.set(clock)
            
            time.sleep(5)
    except Exception as e:
        logger.error(f"Failed to collect GPU metrics: {e}")

# Try to load .env if it exists in the gateway folder (since worker doesn't have one)
env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "gateway", ".env"))
if os.path.exists(env_path):
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
    except ImportError:
        pass

os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# Initialize Model (SDXL fits comfortably in 16GB VRAM using bfloat16)
model_id = "stabilityai/stable-diffusion-xl-base-1.0"
logger.info(f"Loading {model_id} model from Hugging Face...")
device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")

pipe = AutoPipelineForText2Image.from_pretrained(
    model_id, 
    torch_dtype=torch.bfloat16 if device != "cpu" else torch.float32, 
    use_safetensors=True
)

if device == "cuda":
    pipe.enable_model_cpu_offload()
    if hasattr(pipe, "vae"):
        pipe.vae.to(torch.bfloat16)
        pipe.vae.enable_slicing()
        pipe.vae.enable_tiling()
    logger.info("Enabled CPU offloading and VAE optimizations.")
else:
    pipe = pipe.to(device)

img2img_pipe = AutoPipelineForImage2Image.from_pipe(pipe)

logger.info("Model pipeline fully initialized.")

# Start Prometheus endpoint in a background thread for GPU metrics
threading.Thread(target=collect_gpu_metrics, daemon=True).start()

app = FastAPI(title="CloudLLM Inference Worker")
FastAPIInstrumentor.instrument_app(app)

metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

class GenerateRequest(BaseModel):
    job_id: str
    prompt: str
    negative_prompt: str | None = None
    steps: int = Field(default=35, ge=10, le=100)
    guidance_scale: float = Field(default=3.4, ge=1.0, le=20.0)
    width: int = Field(default=832, ge=512, le=2048, multiple_of=64)
    height: int = Field(default=1216, ge=512, le=2048, multiple_of=64)
    init_image_url: str | None = None
    strength: float | None = Field(default=None, ge=0.0, le=1.0)

class GenerateResponse(BaseModel):
    job_id: str
    status: str
    image_url: str | None = None

default_negative_prompt = "low quality, worst quality, normal quality, lowres, blurry, soft, smooth skin, plastic skin, waxy skin, oversaturated, overexposed, underexposed, bad anatomy, bad hands, missing fingers, extra fingers, mutated hands, deformed, disfigured, ugly, text, watermark, logo, signature, jpeg artifacts, compression artifacts, noisy, grainy"

gpu_lock = threading.Lock()

@app.post("/generate", response_model=GenerateResponse)
async def generate_image(request: Request, body: GenerateRequest):
    ctx = propagate.extract(dict(request.headers))
    with tracer.start_as_current_span("worker.process_job", context=ctx) as span:
        span.set_attribute("job_id", body.job_id)
        
        logger.info(f"Running inference for job {body.job_id}...")
        start_time = time.time()
        
        negative_prompt = body.negative_prompt or default_negative_prompt
        
        try:
            worker_status.set(1)
            import asyncio
            
            def run_inference():
                with gpu_lock:
                    if body.init_image_url:
                        logger.info("Downloading init_image from MinIO...")
                        # Get internal URL if needed, but the provided URL should be accessible inside docker
                        img_resp = requests.get(body.init_image_url)
                        init_img = Image.open(io.BytesIO(img_resp.content)).convert("RGB")
                        return img2img_pipe(
                            prompt=body.prompt,
                            image=init_img,
                            strength=body.strength if body.strength is not None else 0.8,
                            negative_prompt=negative_prompt,
                            num_inference_steps=body.steps,
                            guidance_scale=body.guidance_scale,
                        ).images[0]
                    else:
                        return pipe(
                            prompt=body.prompt, 
                            negative_prompt=negative_prompt,
                            num_inference_steps=body.steps,
                            guidance_scale=body.guidance_scale,
                            width=body.width,
                            height=body.height
                        ).images[0]
                
            image = await asyncio.to_thread(run_inference)
            
            end_time = time.time()
            duration = round(end_time - start_time, 3)
            span.set_attribute("duration_seconds", duration)
            generation_duration.observe(duration)
            generations_total.labels(status="success").inc()
            
            logger.info("Inference completed", extra={"job_id": body.job_id, "event": "generation_complete", "duration_seconds": duration})
            
            img_byte_arr = io.BytesIO()
            image.save(img_byte_arr, format='PNG')
            img_bytes = img_byte_arr.getvalue()
            
            image_url = upload_image_to_s3(img_bytes, body.job_id)
            span.set_attribute("image_url", image_url)
            
            logger.info("Finished processing Job successfully!", extra={"job_id": body.job_id})
            
            # Explicitly free memory before the next job
            import gc
            del image
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                
            worker_status.set(0)
            return GenerateResponse(job_id=body.job_id, status="completed", image_url=image_url)
            
        except Exception as e:
            logger.error(f"Error processing job: {e}", extra={"job_id": body.job_id})
            if "CUDA out of memory" in str(e) or "OOM" in str(e):
                oom_errors_total.inc()
            generations_total.labels(status="failed").inc()
            span.record_exception(e)
            worker_status.set(0)
            raise HTTPException(status_code=500, detail=str(e))
