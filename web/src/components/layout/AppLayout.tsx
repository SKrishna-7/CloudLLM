"use client";

import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { CreditsBadge } from "@/components/dashboard/CreditsBadge";
import { HistorySidebar } from "@/components/generator/HistorySidebar";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { useChat } from "@/contexts/ChatContext";
import { usePathname } from "next/navigation";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { activeChatId, setActiveChatId } = useChat();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const pathname = usePathname();

  if (pathname.startsWith('/admin')) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-1 w-full h-screen bg-[#FDFDFD] dark:bg-[#050505] text-zinc-900 dark:text-zinc-100 p-2 md:p-4 font-sans">
      
      {/* Outer App Window */}
      <div className="flex w-full h-full border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden bg-white dark:bg-black shadow-2xl relative">
        
        {/* Sidebar */}
        <div 
          className={`flex flex-col border-r border-zinc-200 dark:border-zinc-800 transition-all duration-300 ease-in-out shrink-0 bg-zinc-50 dark:bg-[#0A0A0A] ${
            isSidebarOpen ? 'w-[280px]' : 'w-0 border-r-0 opacity-0'
          }`}
        >
          {/* Sidebar Header (Logo + Toggle) */}
          <div className="h-16 flex items-center justify-between px-6 shrink-0">
            <span className="font-bold text-lg tracking-tight">CloudLLM</span>
            <button 
              onClick={() => setIsSidebarOpen(false)} 
              className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
          </div>

          {/* Sidebar Content */}
          <div className="flex-1 overflow-hidden">
            <HistorySidebar activeChatId={activeChatId} onSelectChat={setActiveChatId} />
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#0A0A0A] relative">
          
          {/* Top Navigation */}
          <header className="h-16 flex items-center justify-between px-6 border-b border-zinc-200 dark:border-zinc-800 shrink-0 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-md z-20">
            <div className="flex items-center gap-4 w-1/3">
              {!isSidebarOpen && (
                <button 
                  onClick={() => setIsSidebarOpen(true)} 
                  className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
                >
                  <PanelLeftOpen className="w-5 h-5" />
                </button>
              )}
            </div>
            
            {/* Centered Navigation Links */}
            <div className="flex items-center justify-center gap-8 font-medium text-sm text-zinc-500 dark:text-zinc-400 w-1/3">
              <Link href="/developer" className={`transition-colors ${pathname.startsWith('/developer') ? 'text-zinc-900 dark:text-white font-semibold' : 'hover:text-zinc-900 dark:hover:text-white'}`}>Developer API</Link>
              <Link href="/dashboard" className={`transition-colors ${pathname.startsWith('/dashboard') ? 'text-zinc-900 dark:text-white font-semibold' : 'hover:text-zinc-900 dark:hover:text-white'}`}>Dashboard</Link>
            </div>

            {/* Right side: Credits and Avatar */}
            <div className="flex items-center justify-end gap-4 w-1/3">
              <CreditsBadge />
              <div className="h-8 w-8 rounded-full border border-zinc-200 dark:border-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
                <UserButton appearance={{ elements: { userButtonAvatarBox: "w-full h-full" } }} />
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 flex flex-col relative z-10 overflow-hidden bg-zinc-50 dark:bg-black/20">
            {children}
          </main>
        </div>

      </div>
    </div>
  );
}
