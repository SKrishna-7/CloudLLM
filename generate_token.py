import secrets
import hashlib
import uuid

def generate_token():
    # 1. Generate a secure random string
    raw_token_bytes = secrets.token_hex(32)
    prefix = "sk-test-"
    raw_token = f"{prefix}{raw_token_bytes}"
    
    # 2. Hash it using SHA-256
    # Note: Gateway auth hashes the whole token including the prefix, 
    # but the instructions say "sk-test-YOUR_RAW_TOKEN_HERE" for curl.
    # In dependencies.py: hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    # Let's ensure we hash what the user will send.
    # Wait, the instruction says: -H "Authorization: Bearer sk-test-YOUR_RAW_TOKEN_HERE"
    # Wait, in dependencies.py: api_key_header = APIKeyHeader(name="Authorization", auto_error=True)
    # If the user sends 'Bearer sk-test-xxx', the APIKeyHeader will extract 'Bearer sk-test-xxx'.
    # Actually, APIKeyHeader extracts the exact string sent in the header. So if it's 'Bearer sk-test-xxx', it extracts 'Bearer sk-test-xxx'.
    # I should hash exactly what will be sent, or I should tell the user to just send the token without 'Bearer ' if my auth doesn't strip it.
    # In dependencies.py, I just did: key_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    # If they send 'Bearer sk-test-xxx', api_key will be 'Bearer sk-test-xxx'.
    
    curl_header = f"Bearer {raw_token}"
    
    key_hash = hashlib.sha256(curl_header.encode("utf-8")).hexdigest()
    
    # Generate UUIDs
    user_id = str(uuid.uuid4())
    api_key_id = str(uuid.uuid4())
    
    # 3. Output the raw key and SQL command
    sql_command = f"""
INSERT INTO users (id, email, credits_balance) VALUES ('{user_id}', 'admin@local.test', 1000) ON CONFLICT DO NOTHING;
INSERT INTO api_keys (id, user_id, key_hash, prefix) VALUES ('{api_key_id}', '{user_id}', '{key_hash}', '{prefix}');
"""
    
    print(f"RAW CURL HEADER: {curl_header}")
    print(f"RAW TOKEN (For reference): {raw_token}")
    print("--------------------------------------------------")
    print("SQL COMMAND TO INJECT:")
    print(sql_command)
    print("--------------------------------------------------")

if __name__ == "__main__":
    generate_token()
