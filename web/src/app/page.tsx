"use client";

import { UserButton } from "@clerk/nextjs";
import { CreditsBadge } from "@/components/dashboard/CreditsBadge";
import { PromptInput } from "@/components/generator/PromptInput";
import { Sparkles, ArrowUpRight, MonitorPlay, Presentation, LineChart } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex flex-col h-full bg-[#0A0A0A] relative text-zinc-100">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/10 via-black to-purple-900/10 pointer-events-none" />
      
      <header className="flex justify-between items-center px-8 py-5 relative z-10 shrink-0">
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">
          CloudLLM
        </h1>
        <div className="flex items-center gap-4">
          <CreditsBadge />
          <button className="flex items-center gap-2 px-4 py-1.5 bg-[#1B281B] text-[#4CAF50] border border-[#2E7D32]/30 rounded-full text-sm font-medium hover:bg-[#253A25] transition-colors">
            <Sparkles className="w-4 h-4" />
            Update
          </button>
          <div className="flex items-center gap-2 px-4 py-1.5 bg-zinc-800 text-white rounded-full text-sm font-medium hover:bg-zinc-700 transition-colors">
            Settings
          </div>
          <UserButton appearance={{ elements: { userButtonAvatarBox: "w-8 h-8" } }} />
        </div>
      </header>

      <main className="flex-1 flex flex-col relative z-10 min-h-0">
        <PromptInput />
      </main>
    </div>
  );
}
