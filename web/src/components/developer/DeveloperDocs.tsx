"use client";

import { useState } from "react";
import { Check, Copy, Terminal, Code } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function DeveloperDocs() {
  return (
    <div className="w-full max-w-4xl mx-auto mt-12 space-y-12 text-zinc-300">
      
      {/* Introduction */}
      <section className="space-y-4">
        <h3 className="text-2xl font-bold text-white tracking-tight border-b border-zinc-800 pb-2">API Documentation</h3>
        <p className="text-zinc-400 leading-relaxed">
          The CloudLLM API allows you to programmatically generate images using our high-throughput JuggernautXL cluster. 
          The API is organized around REST. Our API has predictable resource-oriented URLs, accepts JSON-encoded request bodies, 
          returns JSON-encoded responses, and uses standard HTTP response codes, authentication, and verbs.
        </p>
      </section>

      {/* Authentication */}
      <section className="space-y-4">
        <h4 className="text-xl font-semibold text-white">Authentication</h4>
        <p className="text-zinc-400">
          The CloudLLM API uses API keys to authenticate requests. You can view and manage your API keys in the 
          developer settings above.
        </p>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 font-mono text-sm">
          <span className="text-zinc-500">Authorization:</span> Bearer <span className="text-blue-400">{"<YOUR_API_KEY>"}</span>
        </div>
      </section>

      {/* Rate Limits */}
      <section className="space-y-4">
        <h4 className="text-xl font-semibold text-white">Rate Limits & Credits</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-5 bg-zinc-950 border-zinc-800">
            <h5 className="font-medium text-white mb-2">Rate Limiting</h5>
            <p className="text-sm text-zinc-400">
              API requests are limited to <strong className="text-zinc-200">60 requests per minute</strong> per IP address. 
              Exceeding this limit will result in a <code className="text-blue-400">429 Too Many Requests</code> response.
            </p>
          </Card>
          <Card className="p-5 bg-zinc-950 border-zinc-800">
            <h5 className="font-medium text-white mb-2">Credit Usage</h5>
            <p className="text-sm text-zinc-400">
              Each successful image generation deducts <strong className="text-zinc-200">1 credit</strong> from your balance. 
              Polling for job status is completely free.
            </p>
          </Card>
        </div>
      </section>

      {/* Endpoints */}
      <section className="space-y-8">
        <h4 className="text-xl font-semibold text-white">Endpoints</h4>
        
        {/* Generate Image */}
        <div className="space-y-4 border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-950/50">
          <div className="flex items-center gap-3 p-4 border-b border-zinc-800 bg-zinc-900/50">
            <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-400 text-xs font-bold font-mono tracking-wider">POST</span>
            <code className="text-sm font-mono text-zinc-200">/v1/images/generate</code>
          </div>
          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <p className="text-sm text-zinc-400">
                Submits a new generation job to the GPU cluster. This endpoint returns a <code className="text-zinc-300 bg-zinc-800 px-1 py-0.5 rounded">job_id</code> that you can use to poll for the result.
              </p>
              
              <div>
                <h6 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Request Body</h6>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-start border-b border-zinc-800/50 pb-2">
                    <code className="text-zinc-200 font-mono">prompt</code>
                    <div className="text-right">
                      <span className="text-xs text-zinc-500 block">string (required)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h6 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Response Properties</h6>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-start border-b border-zinc-800/50 pb-2">
                    <code className="text-zinc-200 font-mono">job_id</code>
                    <span className="text-xs text-zinc-500">uuid</span>
                  </div>
                  <div className="flex justify-between items-start border-b border-zinc-800/50 pb-2">
                    <code className="text-zinc-200 font-mono">status</code>
                    <span className="text-xs text-zinc-500">string (queued)</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <CodeSnippet 
                curl={`curl -X POST "https://api.cloudllm.com/v1/images/generate" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "A futuristic cyberpunk city at night, neon lights, 4k"}'`}
                python={`import requests

headers = {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
}
data = {
    "prompt": "A futuristic cyberpunk city at night, neon lights, 4k"
}

response = requests.post(
    "https://api.cloudllm.com/v1/images/generate", 
    headers=headers, 
    json=data
)
print(response.json())`}
                response={`{
  "job_id": "8a32b9c7-5e11-4b72-9b2d-1f6b8a1c9e42",
  "status": "queued",
  "prompt": "A futuristic cyberpunk city at night, neon lights, 4k",
  "image_url": null,
  "created_at": "2026-09-01T10:00:00Z"
}`}
              />
            </div>
          </div>
        </div>

        {/* Get Job Status */}
        <div className="space-y-4 border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-950/50">
          <div className="flex items-center gap-3 p-4 border-b border-zinc-800 bg-zinc-900/50">
            <span className="px-2 py-1 rounded bg-green-500/20 text-green-400 text-xs font-bold font-mono tracking-wider">GET</span>
            <code className="text-sm font-mono text-zinc-200">/v1/jobs/{"{job_id}"}</code>
          </div>
          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <p className="text-sm text-zinc-400">
                Retrieves the status and result of a generation job. You should poll this endpoint every 2-3 seconds until the status is <code className="text-zinc-300">completed</code> or <code className="text-zinc-300">failed</code>.
              </p>
              
              <div>
                <h6 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Path Parameters</h6>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-start border-b border-zinc-800/50 pb-2">
                    <code className="text-zinc-200 font-mono">job_id</code>
                    <span className="text-xs text-zinc-500">uuid (required)</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <CodeSnippet 
                curl={`curl -X GET "https://api.cloudllm.com/v1/jobs/8a32b9c7-5e11-4b72-9b2d-1f6b8a1c9e42" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
                python={`import requests

headers = {
    "Authorization": "Bearer YOUR_API_KEY"
}

response = requests.get(
    "https://api.cloudllm.com/v1/jobs/8a32b9c7-...", 
    headers=headers
)
print(response.json())`}
                response={`{
  "job_id": "8a32b9c7-5e11-4b72-9b2d-1f6b8a1c9e42",
  "status": "completed",
  "prompt": "A futuristic cyberpunk city at night, neon lights, 4k",
  "image_url": "https://storage.cloudllm.com/images/8a32b9c7.png",
  "created_at": "2026-09-01T10:00:00Z"
}`}
              />
            </div>
          </div>
        </div>

      </section>
    </div>
  );
}

function CodeSnippet({ curl, python, response }: { curl: string, python: string, response: string }) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("curl");

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getActiveCode = () => {
    if (activeTab === "curl") return curl;
    if (activeTab === "python") return python;
    return response;
  };

  return (
    <div className="rounded-xl overflow-hidden bg-[#0d0d0d] border border-zinc-800 shadow-2xl">
      <Tabs defaultValue="curl" onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/80 bg-[#161616]">
          <TabsList className="bg-transparent h-8 p-0 space-x-4">
            <TabsTrigger 
              value="curl" 
              className="data-[state=active]:bg-transparent data-[state=active]:text-white text-zinc-500 hover:text-zinc-300 p-0 text-xs font-mono"
            >
              cURL
            </TabsTrigger>
            <TabsTrigger 
              value="python" 
              className="data-[state=active]:bg-transparent data-[state=active]:text-white text-zinc-500 hover:text-zinc-300 p-0 text-xs font-mono"
            >
              Python
            </TabsTrigger>
            <TabsTrigger 
              value="response" 
              className="data-[state=active]:bg-transparent data-[state=active]:text-blue-400 text-zinc-500 hover:text-zinc-300 p-0 text-xs font-mono"
            >
              Response
            </TabsTrigger>
          </TabsList>
          
          <button 
            onClick={() => copyToClipboard(getActiveCode())}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        
        <TabsContent value="curl" className="p-4 m-0">
          <pre className="text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
            {curl}
          </pre>
        </TabsContent>
        <TabsContent value="python" className="p-4 m-0">
          <pre className="text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
            {python}
          </pre>
        </TabsContent>
        <TabsContent value="response" className="p-4 m-0">
          <pre className="text-xs font-mono text-green-400 overflow-x-auto whitespace-pre-wrap leading-relaxed">
            {response}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}
