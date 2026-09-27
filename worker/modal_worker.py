import os
import io
import time
from typing import Optional
from pydantic import BaseModel, Field

import modal

# Define the Modal App
app = modal.App("cloudllm-worker")

# Define the model we are using
MODEL_ID = "glides/illustriousxl"

# Build an image with all required dependencies
image = (
    modal.Image.debian_slim()
    .pip_install(
        "torch",
        "diffusers",
        "transformers",
        "accelerate",
        "pillow",
        "boto3",
        "fastapi",
        "pydantic",
        "requests"
    )
)

# Download the model weights during the build step to cache them
@image.imports()
def download_model():
    import torch
    from diffusers import AutoPipelineForText2Image
    print(f"Downloading model {MODEL_ID}...")
    AutoPipelineForText2Image.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.bfloat16,
        use_safetensors=True
    )

# The expected request payload (matching the Go Gateway & old worker)
class GenerateRequest(BaseModel):
    job_id: str
    prompt: str
    negative_prompt: Optional[str] = None
    steps: int = Field(default=25, ge=10, le=100)
    guidance_scale: float = Field(default=3.4, ge=1.0, le=20.0)
    width: int = Field(default=832, ge=512, le=2048)
    height: int = Field(default=1216, ge=512, le=2048)
    init_image_url: Optional[str] = None
    strength: Optional[float] = None
    
# The expected response payload (matching the Go Scheduler)
class GenerateResponse(BaseModel):
    job_id: str
    status: str
    image_url: Optional[str] = None

# S3 Upload logic from original storage.py
def upload_image_to_s3(image_bytes: bytes, job_id: str) -> str:
    import boto3
    from botocore.client import Config
    
    # We will pass these via Modal Secrets
    endpoint_url = os.environ.get("S3_ENDPOINT_URL")
    access_key = os.environ.get("S3_ACCESS_KEY")
    secret_key = os.environ.get("S3_SECRET_KEY")
    region_name = os.environ.get("S3_REGION", "us-east-1")
    if "googleapis.com" in endpoint_url:
        region_name = "auto"
        
    bucket_name = os.environ.get("S3_BUCKET_NAME", "images")
    
    client = boto3.client(
        's3',
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version='s3'),
        region_name=region_name
    )
    
    object_name = f"{job_id}.png"
    
    client.put_object(
        Bucket=bucket_name,
        Key=object_name,
        Body=image_bytes,
        ContentType='image/png'
    )
    
    external_url = os.environ.get("S3_EXTERNAL_URL") or endpoint_url
    s3_url = f"{external_url}/{bucket_name}/{object_name}"
    
    return s3_url

# The GPU Worker Endpoint
import os

# Safely parse .env.gcp using standard Python (so we don't need python-dotenv installed in the Modal container)
env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env.gcp"))
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip().strip("'").strip('"')

@app.function(
    image=image, 
    gpu="T4", 
    secrets=[
        modal.Secret.from_dict({
            "S3_ENDPOINT_URL": os.environ.get("S3_ENDPOINT_URL", ""),
            "S3_ACCESS_KEY": os.environ.get("S3_ACCESS_KEY", ""),
            "S3_SECRET_KEY": os.environ.get("S3_SECRET_KEY", ""),
            "S3_BUCKET_NAME": os.environ.get("S3_BUCKET_NAME", ""),
            "S3_REGION": os.environ.get("S3_REGION", ""),
        })
    ]
)
@modal.fastapi_endpoint(method="POST")
def generate_image(req: dict) -> dict:
    import torch
    from diffusers import AutoPipelineForText2Image, AutoPipelineForImage2Image
    from PIL import Image
    import requests
    
    print(f"Received payload: {req}")
    # Validate payload
    try:
        request = GenerateRequest(**req)
    except Exception as e:
        print(f"Validation Error: {e}")
        return {"error": str(e)}
        
    print(f"Starting inference for job {request.job_id}...")
    start_time = time.time()
    
    # Load model from cache
    pipe = AutoPipelineForText2Image.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.bfloat16,
        use_safetensors=True
    )
    
    pipe.enable_model_cpu_offload()
    try:
        pipe.enable_vae_slicing()
        pipe.enable_vae_tiling()
    except Exception as e:
        print(f"VAE optimization warning: {e}")
    
    default_negative_prompt = "low quality, worst quality, normal quality, lowres, blurry, soft, smooth skin, plastic skin, waxy skin, oversaturated, overexposed, underexposed, bad anatomy, bad hands, missing fingers, extra fingers, mutated hands, deformed, disfigured, ugly, text, watermark, logo, signature, jpeg artifacts, compression artifacts, noisy, grainy"
    negative_prompt = request.negative_prompt or default_negative_prompt

    if request.init_image_url:
        print("Downloading init_image...")
        img_resp = requests.get(request.init_image_url)
        init_img = Image.open(io.BytesIO(img_resp.content)).convert("RGB")
        img2img_pipe = AutoPipelineForImage2Image.from_pipe(pipe)
        
        image_result = img2img_pipe(
            prompt=request.prompt,
            image=init_img,
            strength=request.strength if request.strength is not None else 0.8,
            negative_prompt=negative_prompt,
            num_inference_steps=request.steps,
            guidance_scale=request.guidance_scale,
        ).images[0]
    else:
        image_result = pipe(
            prompt=request.prompt,
            negative_prompt=negative_prompt,
            num_inference_steps=request.steps,
            guidance_scale=request.guidance_scale,
            width=request.width,
            height=request.height
        ).images[0]
        
    print(f"Inference complete in {time.time() - start_time:.2f}s")
    
    img_byte_arr = io.BytesIO()
    image_result.save(img_byte_arr, format='PNG')
    img_bytes = img_byte_arr.getvalue()
    
    # Upload to S3
    image_url = upload_image_to_s3(img_bytes, request.job_id)
    
    return GenerateResponse(job_id=request.job_id, status="completed", image_url=image_url).model_dump()
