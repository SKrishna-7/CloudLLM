"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@clerk/nextjs";
import { Activity, Database, Server, RefreshCw, HardDrive, Network } from "lucide-react";

export default function SystemHealthPage() {
  const { getToken } = useAuth();
  
  const { data: stats, isLoading } = useQuery({
    queryKey: ["adminSystemOverview"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("No token");
      return api.getAdminOverview(token);
    },
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">System Health</h2>
        <p className="text-neutral-400 mt-1">Real-time observability of cluster infrastructure.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Gateway API */}
        <div className="bg-[#111] border border-white/10 rounded-lg p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-md">
                <Network className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="font-semibold text-white">FastAPI Gateway</h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Healthy
            </div>
          </div>
          <p className="text-sm text-neutral-400 mb-6 flex-1">
            Main REST API handling authentication, billing, and queue delegation.
          </p>
          <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Status</div>
              <div className="text-sm font-medium text-emerald-400">Online</div>
            </div>
          </div>
        </div>

        {/* PostgreSQL */}
        <div className="bg-[#111] border border-white/10 rounded-lg p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 rounded-md">
                <Database className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="font-semibold text-white">PostgreSQL</h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Healthy
            </div>
          </div>
          <p className="text-sm text-neutral-400 mb-6 flex-1">
            Primary datastore for users, jobs, chats, and API keys.
          </p>
          <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
             <div>
              <div className="text-xs text-neutral-500 mb-1">Users</div>
              <div className="text-sm font-medium text-white">{isLoading ? "-" : stats?.total_users}</div>
            </div>
          </div>
        </div>

        {/* Redis Broker */}
        <div className="bg-[#111] border border-white/10 rounded-lg p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-md">
                <Activity className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="font-semibold text-white">Redis Broker</h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Healthy
            </div>
          </div>
          <p className="text-sm text-neutral-400 mb-6 flex-1">
            Message queue distributing generation tasks to GPU workers.
          </p>
          <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Queue Depth</div>
              <div className="text-sm font-medium text-white">{isLoading ? "-" : stats?.queue_length}</div>
            </div>
          </div>
        </div>

        {/* GPU Cluster */}
        <div className="bg-[#111] border border-white/10 rounded-lg p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-md">
                <Server className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-white">GPU Workers</h3>
            </div>
            {stats?.active_workers === 0 ? (
              <div className="flex items-center gap-2 text-xs font-medium text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">
                No Workers
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Active
              </div>
            )}
          </div>
          <p className="text-sm text-neutral-400 mb-6 flex-1">
            PyTorch inference nodes executing diffusion models.
          </p>
          <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Active Nodes</div>
              <div className="text-sm font-medium text-white">{isLoading ? "-" : stats?.active_workers}</div>
            </div>
          </div>
        </div>

        {/* MinIO Storage */}
        <div className="bg-[#111] border border-white/10 rounded-lg p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-md">
                <HardDrive className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="font-semibold text-white">MinIO Storage</h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Healthy
            </div>
          </div>
          <p className="text-sm text-neutral-400 mb-6 flex-1">
            S3-compatible object storage for generated image artifacts.
          </p>
          <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Status</div>
              <div className="text-sm font-medium text-emerald-400">Online</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
