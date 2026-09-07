import os
import io
import time
import threading
import torch
import pynvml
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
import uvicorn
from prometheus_client import Gauge, make_asgi_app
from opentelemetry import trace, propagate
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource, SERVICE_NAME
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler
from storage import upload_image_to_minio
from logger import get_logger

logger = get_logger(__name__)

# Setup OpenTelemetry
resource = Resource(attributes={SERVICE_NAME: "python-worker"})
provider = TracerProvider(resource=resource)
processor = BatchSpanProcessor(OTLPSpanExporter(endpoint="http://localhost:4318/v1/traces"))
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)
tracer = trace.get_tracer(__name__)

# Prometheus Metrics
gpu_vram_used = Gauge('cloudllm_gpu_vram_used_bytes', 'GPU VRAM used in bytes')
gpu_temperature = Gauge('cloudllm_gpu_temperature_celsius', 'GPU Temperature in Celsius')

def collect_gpu_metrics():
    try:
        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        while True:
            info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            gpu_vram_used.set(info.used)
            temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            gpu_temperature.set(temp)
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

# Initialize Model
logger.info("Loading JuggernautXL local safetensors model...")
model_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Model", "juggernautXL_ragnarok.safetensors"))
device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")

pipe = StableDiffusionXLPipeline.from_single_file(
    model_path, 
    torch_dtype=torch.float16 if device != "cpu" else torch.float32, 
    use_safetensors=True
)

pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True)

if device == "cuda":
    pipe.enable_sequential_cpu_offload()
    pipe.vae.to(torch.float16)
    pipe.vae.enable_slicing()
    pipe.vae.enable_tiling()
    logger.info("Enabled CPU offloading, VAE slicing, and forced FP16 VAE to prevent OOM errors.")
else:
    pipe = pipe.to(device)

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
    steps: int = 35
    guidance_scale: float = 3.4
    width: int = 832
    height: int = 1216

class GenerateResponse(BaseModel):
    job_id: str
    status: str
    image_url: str | None = None

default_negative_prompt = "low quality, worst quality, normal quality, lowres, blurry, soft, smooth skin, plastic skin, waxy skin, oversaturated, overexposed, underexposed, bad anatomy, bad hands, missing fingers, extra fingers, mutated hands, deformed, disfigured, ugly, text, watermark, logo, signature, jpeg artifacts, compression artifacts, noisy, grainy"

@app.post("/generate", response_model=GenerateResponse)
async def generate_image(request: Request, body: GenerateRequest):
    ctx = propagate.extract(dict(request.headers))
    with tracer.start_as_current_span("worker.process_job", context=ctx) as span:
        span.set_attribute("job_id", body.job_id)
        
        logger.info(f"Running inference for job {body.job_id}...")
        start_time = time.time()
        
        negative_prompt = body.negative_prompt or default_negative_prompt
        
        try:
            image = pipe(
                prompt=body.prompt, 
                negative_prompt=negative_prompt,
                num_inference_steps=body.steps,
                guidance_scale=body.guidance_scale,
                width=body.width,
                height=body.height
            ).images[0]
            
            end_time = time.time()
            duration = round(end_time - start_time, 3)
            span.set_attribute("duration_seconds", duration)
            
            logger.info("Inference completed", extra={"job_id": body.job_id, "event": "generation_complete", "duration_seconds": duration})
            
            img_byte_arr = io.BytesIO()
            image.save(img_byte_arr, format='PNG')
            img_bytes = img_byte_arr.getvalue()
            
            minio_url = upload_image_to_minio(img_bytes, body.job_id)
            span.set_attribute("image_url", minio_url)
            
            logger.info("Finished processing Job successfully!", extra={"job_id": body.job_id})
            
            # Explicitly free memory before the next job
            import gc
            del image
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                
            return GenerateResponse(job_id=body.job_id, status="completed", image_url=minio_url)
            
        except Exception as e:
            logger.error(f"Error processing job: {e}", extra={"job_id": body.job_id})
            span.record_exception(e)
            raise HTTPException(status_code=500, detail=str(e))
