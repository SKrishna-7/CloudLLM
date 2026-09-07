"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, Sparkles, AlertCircle, Bot, User, ArrowUpRight, Paperclip, ArrowRight, Mic, Download, Settings2, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

const suggestions = [
  {
    title: "Photorealistic Portrait",
    description: "A highly detailed portrait of a cyberpunk hacker with neon lights."
  },
  {
    title: "Anime Style",
    description: "A young warrior training with a mystical sword, Studio Ghibli style."
  },
  {
    title: "Cinematic Landscape",
    description: "A sweeping aerial view of an alien planet with two suns."
  },
  {
    title: "Logo Design",
    description: "A minimalist vector logo for a modern tech startup."
  }
];

export function PromptInput() {
  const [prompt, setPrompt] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [negativePrompt, setNegativePrompt] = useState("");
  const [steps, setSteps] = useState(35);
  const [guidanceScale, setGuidanceScale] = useState(3.4);
  const [width, setWidth] = useState(832);
  const [height, setHeight] = useState(1216);
  const { getToken } = useAuth();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch job history
  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return api.getJobs(token);
    },
    refetchInterval: (query) => {
      // Poll if any job is still queued or processing
      const hasPending = query.state.data?.some(
        (job: any) => job.status === "queued" || job.status === "processing"
      );
      return hasPending ? 2000 : false;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (params: { prompt: string, negative_prompt?: string, steps?: number, guidance_scale?: number, width?: number, height?: number }) => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return api.generateImage(params, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      scrollToBottom();
    },
    onError: (error: any) => {
      console.error(error);
      alert(error?.response?.data?.detail || "Failed to generate image. Please check your credits.");
    },
  });

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [jobs.length, jobs.map((j: any) => j.status).join(",")]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || generateMutation.isPending) return;
    generateMutation.mutate({
      prompt,
      negative_prompt: negativePrompt || undefined,
      steps,
      guidance_scale: guidanceScale,
      width,
      height
    });
    setPrompt("");
  };

  const handleDownload = async (imageUrl: string, prompt: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${prompt.slice(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Failed to download image", err);
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      
      {/* Scrollable Content Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 md:px-12 py-10 pb-32 scroll-smooth"
      >
        {jobs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center h-full pt-16">
            {/* Hexagon dots logo */}
            <div className="grid grid-cols-2 gap-1.5 mb-10 rotate-45">
              <div className="w-4 h-4 bg-black rounded-full"></div>
              <div className="w-4 h-4 bg-black rounded-full"></div>
              <div className="w-4 h-4 bg-black rounded-full"></div>
              <div className="w-4 h-4 bg-black rounded-full"></div>
            </div>

            <div className="text-center space-y-4 mb-16 max-w-2xl mx-auto">
              <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-white">
                What will you <span className="text-indigo-400">create</span> today?
              </h2>
              <p className="text-zinc-400 text-base max-w-lg mx-auto">
                Powered by JuggernautXL and our high-throughput GPU cluster. Choose a style below or enter your own prompt to start generating stunning images.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 max-w-5xl w-full mb-12">
              {suggestions.map((item, idx) => (
                <div 
                  key={idx} 
                  onClick={() => setPrompt(item.title)}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-colors cursor-pointer group flex flex-col justify-between h-40"
                >
                  <div className="flex justify-between items-start">
                    <h3 className="font-semibold text-white leading-tight w-2/3 text-lg">{item.title}</h3>
                    <div className="w-8 h-8 rounded-full border border-zinc-700 flex items-center justify-center group-hover:bg-zinc-800 transition-colors shrink-0">
                      <ArrowUpRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-300" />
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto w-full space-y-12">
            {jobs.map((job: any) => (
              <div key={job.job_id} className="space-y-8">
                
                {/* User Prompt Message */}
                <div className="flex items-start gap-4 justify-end">
                  <div className="bg-zinc-800 px-6 py-4 rounded-3xl rounded-tr-sm text-zinc-100 max-w-[80%] shadow-sm">
                    <p className="text-base leading-relaxed">{job.prompt}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0 overflow-hidden shrink-0 mt-1">
                    {user?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.imageUrl} alt="User" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-zinc-400" />
                    )}
                  </div>
                </div>

                {/* AI Response Message */}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shrink-0 mt-1">
                    {/* Hexagon dots logo */}
                    <div className="grid grid-cols-2 gap-0.5 rotate-45 scale-75">
                      <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                      <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                      <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                      <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                    </div>
                  </div>
                  
                  <div className="max-w-[85%]">
                    {job.status === "completed" && job.image_url ? (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="relative group"
                      >
                        <Card className="overflow-hidden rounded-3xl border-zinc-800 bg-zinc-900 shadow-sm p-2 relative group/card">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={job.image_url} 
                            alt={job.prompt}
                            className="w-full max-h-[600px] object-contain rounded-2xl"
                          />
                          <div className="absolute top-4 right-4 opacity-0 group-hover/card:opacity-100 transition-opacity">
                            <Button 
                              variant="secondary" 
                              size="icon"
                              className="rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-100 backdrop-blur-sm"
                              onClick={() => handleDownload(job.image_url, job.prompt)}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </Card>
                      </motion.div>
                    ) : job.status === "failed" ? (
                      <Card className="flex items-center gap-3 p-4 bg-red-950/30 border-red-900/50 text-red-400 rounded-2xl">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p className="text-sm">Generation failed due to a server error. Please try again.</p>
                      </Card>
                    ) : (
                      <div className="w-64 sm:w-80 md:w-96 aspect-square relative rounded-3xl overflow-hidden border border-zinc-800 bg-zinc-900 shadow-sm p-2">
                        <Skeleton className="w-full h-full absolute inset-0 bg-zinc-800 rounded-2xl" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 space-y-4">
                          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
                          <p className="text-sm font-medium animate-pulse tracking-wide">
                            {job.status === "processing" ? "Generating..." : "Starting..."}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {/* Optimistic UI for currently submitting job */}
            {generateMutation.isPending && (
              <div className="flex items-start gap-4 justify-end opacity-60">
                <div className="bg-zinc-800 px-6 py-4 rounded-3xl rounded-tr-sm text-zinc-100 max-w-[80%] shadow-sm">
                  <p className="text-base leading-relaxed flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> {prompt || "Sending..."}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Bar pinned to bottom */}
      <div className="absolute bottom-8 left-0 right-0 px-4 md:px-12 flex flex-col items-center w-full">
        
        <AnimatePresence>
          {showSettings && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-4 shadow-xl"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Negative Prompt</label>
                    <Input
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      placeholder="e.g. blurry, low quality, deformed"
                      className="bg-zinc-950/50 border-zinc-800 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Width</label>
                      <Input
                        type="number"
                        value={width}
                        onChange={(e) => setWidth(Number(e.target.value))}
                        step={64}
                        min={512}
                        max={1536}
                        className="bg-zinc-950/50 border-zinc-800 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Height</label>
                      <Input
                        type="number"
                        value={height}
                        onChange={(e) => setHeight(Number(e.target.value))}
                        step={64}
                        min={512}
                        max={1536}
                        className="bg-zinc-950/50 border-zinc-800 text-sm"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-zinc-400 mb-1.5 flex justify-between">
                      <span>Steps</span>
                      <span>{steps}</span>
                    </label>
                    <input 
                      type="range" 
                      min="10" 
                      max="50" 
                      value={steps} 
                      onChange={(e) => setSteps(Number(e.target.value))}
                      className="w-full accent-indigo-500" 
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-400 mb-1.5 flex justify-between">
                      <span>Guidance Scale</span>
                      <span>{guidanceScale}</span>
                    </label>
                    <input 
                      type="range" 
                      min="1" 
                      max="20" 
                      step="0.1"
                      value={guidanceScale} 
                      onChange={(e) => setGuidanceScale(Number(e.target.value))}
                      className="w-full accent-indigo-500" 
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="w-full max-w-4xl relative">
          <div className="relative flex items-center bg-zinc-900 rounded-full border border-zinc-800 p-2 shadow-sm transition-all focus-within:shadow-md focus-within:border-zinc-700">
            <button 
              type="button" 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-3 transition-colors rounded-full hover:bg-zinc-800 ml-1 ${showSettings ? 'text-indigo-400' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <Settings2 className="w-5 h-5" />
            </button>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={generateMutation.isPending}
              placeholder="type your prompt here"
              className="flex-1 bg-transparent border-0 focus-visible:ring-0 text-base md:text-lg placeholder:text-zinc-500 text-white px-2 h-14"
            />
            <button type="button" className="p-3 text-zinc-400 hover:text-zinc-200 transition-colors rounded-full hover:bg-zinc-800 mr-1">
              <Mic className="w-5 h-5" />
            </button>
            <Button 
              disabled={generateMutation.isPending || !prompt.trim()}
              type="submit" 
              className="rounded-full bg-indigo-500 hover:bg-indigo-600 text-white p-0 w-12 h-12 flex items-center justify-center mr-1 shadow-sm transition-colors"
            >
              {generateMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
            </Button>
          </div>
        </form>
      </div>

    </div>
  );
}
