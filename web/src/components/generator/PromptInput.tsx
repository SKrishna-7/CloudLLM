"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, Sparkles, AlertCircle, Bot, User, ArrowUpRight, Paperclip, ArrowRight, Mic, Download, Settings2, ChevronDown, ChevronUp, Square } from "lucide-react";
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

interface PromptInputProps {
  activeChatId: string | null;
  onChatCreated: (id: string) => void;
}

export function PromptInput({ activeChatId, onChatCreated }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [initImage, setInitImage] = useState<File | null>(null);
  const [strength, setStrength] = useState(0.35);
  const { getToken } = useAuth();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch jobs for the active chat
  const { data: activeJobs = [] } = useQuery({
    queryKey: ["jobs", activeChatId],
    queryFn: async () => {
      if (!activeChatId) return [];
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return api.getChatJobs(activeChatId, token);
    },
    enabled: !!activeChatId,
    refetchInterval: (query) => {
      // Poll if any job is still queued or processing and hasn't timed out
      const hasPending = query.state.data?.some(
        (job: any) => {
          if (job.status !== "queued" && job.status !== "processing") return false;
          if (!job.created_at) return true;
          const dateStr = job.created_at.endsWith('Z') ? job.created_at : job.created_at + 'Z';
          const createdAt = new Date(dateStr).getTime();
          return (Date.now() - createdAt) <= 10 * 60 * 1000;
        }
      );
      return hasPending ? 2000 : false;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (params: { prompt: string, negative_prompt?: string, steps?: number, guidance_scale?: number, width?: number, height?: number, init_image?: File, strength?: number, chat_id?: string }) => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return api.generateImage(params, token);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["jobs", activeChatId] });
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      if (data && data.chat_id && data.chat_id !== activeChatId) {
        onChatCreated(data.chat_id);
      }
      scrollToBottom();
    },
    onError: (error: any) => {
      console.error(error);
      alert(error?.response?.data?.detail || "Failed to generate image. Please check your credits.");
    },
  });

  const stopMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return api.deleteJob(jobId, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatJobs", activeChatId] });
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    }
  });

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const isJobStuck = (job: any) => {
    if (job.status === "completed" || job.status === "failed") return false;
    if (!job.created_at) return false;
    const dateStr = job.created_at.endsWith('Z') ? job.created_at : job.created_at + 'Z';
    const createdAt = new Date(dateStr).getTime();
    return (Date.now() - createdAt) > 10 * 60 * 1000; // 10 minutes timeout
  };

  const isGenerating = activeJobs.some(
    (j: any) => (j.status === "queued" || j.status === "processing") && !isJobStuck(j)
  );

  const handleStop = () => {
    const generatingJob = activeJobs.find((j: any) => j.status === "queued" || j.status === "processing");
    if (generatingJob) {
      stopMutation.mutate(generatingJob.job_id);
    }
  };


  useEffect(() => {
    scrollToBottom();
  }, [activeJobs.length, activeJobs.map((j: any) => j.status).join(",")]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || generateMutation.isPending || isGenerating) return;
    generateMutation.mutate({
      prompt,
      steps: 25,
      guidance_scale: 3.4,
      width: 832,
      height: 1216,
      init_image: initImage || undefined,
      strength: initImage ? strength : undefined,
      chat_id: activeChatId || undefined
    });
    setPrompt("");
    setInitImage(null);
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
        {activeJobs.length === 0 ? (
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
            {activeJobs.map((job: any) => (
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
                          
                          {/* Time Taken Badge */}
                          {job.completed_at && job.created_at && (
                            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full text-[11px] font-medium text-zinc-300 opacity-0 group-hover/card:opacity-100 transition-opacity">
                              {(new Date(job.completed_at).getTime() - new Date(job.created_at).getTime()) / 1000}s
                            </div>
                          )}
                        </Card>
                      </motion.div>
                    ) : job.status === "failed" || isJobStuck(job) ? (
                      <Card className="flex items-center gap-3 p-4 bg-red-950/30 border-red-900/50 text-red-400 rounded-2xl">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p className="text-sm">
                          {job.status === "failed" 
                            ? "Generation failed due to a server error. Please try again." 
                            : "Generation timed out due to a server error. Please try again."}
                        </p>
                      </Card>
                    ) : (
                      <div className="w-64 sm:w-80 md:w-96 aspect-square relative rounded-3xl overflow-hidden border border-zinc-800 bg-zinc-900 shadow-sm p-2">
                        <Skeleton className="w-full h-full absolute inset-0 bg-zinc-800 rounded-2xl" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 space-y-4">
                          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
                          <p className="text-sm font-medium animate-pulse tracking-wide">
                            {job.status === "processing" 
                              ? "Generating..." 
                              : job.queue_position 
                                ? `In Queue: Position ${job.queue_position}`
                                : "Starting..."}
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
      <div className="absolute bottom-4 md:bottom-8 left-0 right-0 px-2 md:px-12 flex flex-col items-center w-full">
        <form onSubmit={handleSubmit} className="w-full max-w-4xl relative">
          
          {initImage && (
            <div className="absolute -top-16 left-4 bg-zinc-800 rounded-lg p-1.5 flex items-center gap-3 shadow-lg border border-zinc-700">
              <div className="w-12 h-12 rounded bg-zinc-900 overflow-hidden relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(initImage)} alt="Init" className="w-full h-full object-cover opacity-80" />
              </div>
              <div className="text-xs text-zinc-300 pr-2">
                <p className="font-medium truncate w-32">{initImage.name}</p>
                <button type="button" onClick={() => setInitImage(null)} className="text-red-400 hover:text-red-300">Remove</button>
              </div>
            </div>
          )}

          <div className="relative flex items-center bg-zinc-900 rounded-full border border-zinc-800 p-2 shadow-sm transition-all focus-within:shadow-md focus-within:border-zinc-700">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={generateMutation.isPending || isGenerating}
              placeholder="type your prompt here"
              className="flex-1 bg-transparent border-0 focus-visible:ring-0 text-base md:text-lg placeholder:text-zinc-500 text-white px-2 h-14"
            />
            
            <input 
              type="file" 
              id="file-upload" 
              accept="image/*" 
              className="hidden" 
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setInitImage(e.target.files[0]);
                }
              }} 
            />
            <label htmlFor="file-upload" className="cursor-pointer p-3 text-zinc-400 hover:text-zinc-200 transition-colors rounded-full hover:bg-zinc-800 mr-1">
              <Paperclip className="w-5 h-5" />
            </label>

            {isGenerating ? (
              <Button 
                type="button" 
                onClick={handleStop}
                disabled={stopMutation.isPending}
                className="rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 p-0 w-12 h-12 flex items-center justify-center mr-1 shadow-sm transition-colors"
              >
                {stopMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Square className="w-5 h-5 fill-current" />}
              </Button>
            ) : (
              <Button 
                disabled={generateMutation.isPending || !prompt.trim()}
                type="submit" 
                className="rounded-full bg-indigo-500 hover:bg-indigo-600 text-white p-0 w-12 h-12 flex items-center justify-center mr-1 shadow-sm transition-colors"
              >
                {generateMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
              </Button>
            )}
          </div>
        </form>
      </div>

    </div>
  );
}
