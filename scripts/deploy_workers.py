import os
import json
import subprocess
import argparse

def run_command(cmd):
    print(f"Executing: {cmd}")
    result = subprocess.run(cmd, shell=True, text=True, capture_output=True)
    if result.returncode != 0:
        print(f"Error executing command: {result.stderr}")
        return None
    return result.stdout

def search_vast_instances(gpu_name="RTX_4090", min_ram=24):
    """Searches for available Vast.ai instances matching criteria."""
    print(f"Searching for available {gpu_name} instances...")
    
    # We want instances with at least 1 GPU, good reliability, and matching RAM
    query = f"gpu_name={gpu_name} num_gpus>=1 rented=False inet_down>100 inet_up>100 reliability>0.98"
    cmd = f"vastai search offers '{query}' -o 'json'"
    
    output = run_command(cmd)
    if not output:
        return []
        
    try:
        instances = json.loads(output)
        return instances
    except json.JSONDecodeError:
        print("Failed to parse vastai output.")
        return []

def deploy_to_instance(instance_id, image_name, env_vars):
    """Deploys the docker image to a specific Vast.ai instance."""
    print(f"Deploying {image_name} to instance {instance_id}...")
    
    # Construct the environment variable string
    env_str = " ".join([f"-e {k}={v}" for k, v in env_vars.items()])
    
    cmd = f"vastai create instance {instance_id} --image {image_name} --env '{env_str}' --disk 50 --ssh"
    output = run_command(cmd)
    if output:
        print(f"Successfully deployed to instance {instance_id}")
        print(output)
        return True
    return False

def main():
    parser = argparse.ArgumentParser(description="Automated Vast.ai GPU Worker Deployment")
    parser.add_argument("--image", required=True, help="Docker image (e.g. yourusername/cloudllm-worker:latest)")
    parser.add_argument("--gpu", default="RTX_4090", help="Target GPU type (default: RTX_4090)")
    parser.add_argument("--count", type=int, default=1, help="Number of instances to provision")
    
    args = parser.parse_args()
    
    print("="*50)
    print("🚀 Vast.ai Worker Deployment Automation")
    print("="*50)
    
    # Ensure VAST_API_KEY is set
    if not os.getenv("VAST_API_KEY"):
        print("❌ Error: VAST_API_KEY environment variable is missing!")
        print("Please set it using: export VAST_API_KEY='your_api_key'")
        return
        
    # Read production environment variables to inject into the worker
    env_keys = [
        "REDIS_URL", 
        "WEBHOOK_URL", 
        "WEBHOOK_SECRET", 
        "S3_ENDPOINT_URL", 
        "S3_ACCESS_KEY", 
        "S3_SECRET_KEY", 
        "S3_BUCKET_NAME", 
        "S3_REGION",
        "HUGGINGFACE_TOKEN"
    ]
    
    env_vars = {}
    missing_keys = []
    for key in env_keys:
        val = os.getenv(key)
        if not val:
            missing_keys.append(key)
        else:
            env_vars[key] = val
            
    if missing_keys:
        print(f"⚠️ Warning: The following environment variables are missing from your current session:")
        for k in missing_keys:
            print(f"  - {k}")
        print("The worker might fail to start if these are strictly required.")
        response = input("Do you want to continue anyway? (y/n): ")
        if response.lower() != 'y':
            return
            
    # Search for instances
    instances = search_vast_instances(args.gpu)
    if not instances:
        print(f"❌ No suitable {args.gpu} instances found.")
        return
        
    print(f"Found {len(instances)} available instances. Sorting by cheapest...")
    
    # Sort by price (dph_total)
    sorted_instances = sorted(instances, key=lambda x: x.get('dph_total', 999))
    
    # Provision the requested count
    provisioned = 0
    for inst in sorted_instances:
        if provisioned >= args.count:
            break
            
        inst_id = inst.get('id')
        price = inst.get('dph_total')
        print(f"\nAttempting to rent Instance {inst_id} (${price:.3f}/hr)...")
        
        success = deploy_to_instance(inst_id, args.image, env_vars)
        if success:
            provisioned += 1
            
    print("="*50)
    if provisioned == args.count:
        print(f"✅ Successfully provisioned {provisioned} worker(s)!")
    else:
        print(f"⚠️ Only managed to provision {provisioned}/{args.count} worker(s).")

if __name__ == "__main__":
    main()
