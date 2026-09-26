"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Image as ImageIcon, Loader2, MessageSquare, Settings2, Home, FolderOpen } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface HistorySidebarProps {
  activeChatId: string | null;
  onSelectChat: (id: string | null) => void;
}

export function HistorySidebar({ activeChatId, onSelectChat }: HistorySidebarProps) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const { data: chats = [], isLoading } = useQuery({
    queryKey: ["chats"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return api.getChats(token);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (chatId: string) => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return api.deleteChat(chatId, token);
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      if (activeChatId === deletedId) {
        onSelectChat(null);
      }
    },
  });

  return (
    <div className="flex flex-col h-full bg-transparent w-full pb-2">
      
      {/* Top Links */}
      <div className="p-4 space-y-1 shrink-0">
        <Link href="/">
          <Button 
            onClick={() => onSelectChat(null)}
            variant="ghost" 
            className={`w-full justify-start gap-3 font-normal rounded-xl h-12 transition-colors ${activeChatId === null ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'hover:bg-zinc-200/50 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-300'}`}
          >
            <Home className="w-5 h-5" />
            Home
          </Button>
        </Link>
        <Link href="/dashboard">
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 hover:bg-zinc-200/50 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-300 font-normal rounded-xl h-12 transition-colors"
          >
            <FolderOpen className="w-5 h-5" />
            Dashboard
          </Button>
        </Link>
      </div>

      {/* Scrollable Sessions Box */}
      <div className="flex-1 overflow-hidden px-4 pb-2">
        <div className="h-full bg-white dark:bg-[#0D0D0D] rounded-3xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden shadow-sm">
          <div className="px-4 py-4 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/80 dark:bg-black/40 shrink-0 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Sessions</span>
            <button onClick={() => onSelectChat(null)} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1 scroll-smooth">
            {isLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
              </div>
            ) : chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-zinc-400">
                <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-sm">No sessions yet.</p>
              </div>
            ) : (
              chats.map((chat: any) => (
                <div 
                  key={chat.id}
                  onClick={() => onSelectChat(chat.id)}
                  className={`group flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-colors ${
                    activeChatId === chat.id 
                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white" 
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-sm truncate font-medium">{chat.title}</span>
                      <span className="text-[10px] opacity-70">
                        {new Date(chat.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(chat.id);
                    }}
                    disabled={deleteMutation.isPending}
                    className={`p-1.5 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0 ${activeChatId === chat.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Settings Bottom */}
      <div className="p-4 shrink-0">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 hover:bg-zinc-200/50 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-300 font-normal rounded-xl h-12 transition-colors"
        >
          <Settings2 className="w-5 h-5" />
          Settings
        </Button>
      </div>
    </div>
  );
}
