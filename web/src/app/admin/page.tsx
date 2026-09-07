"use client";

import { useQuery } from "@tanstack/react-query";
import { UserButton } from "@clerk/nextjs";
import { Activity, Server, LayoutList, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminDashboard() {
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ["adminStats"],
    queryFn: () => api.getAdminStats(),
    refetchInterval: 3000, // Poll every 3 seconds
  });

  return (
    <div className="min-h-screen bg-black text-white selection:bg-blue-500/30">
      <header className="flex justify-between items-center p-6 border-b border-white/5 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center font-bold">
            A
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Admin Console</h1>
        </div>
        <div className="flex items-center gap-4">
          <UserButton appearance={{ elements: { userButtonAvatarBox: "w-9 h-9" } }} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">System Status</h2>
            <p className="text-zinc-400 mt-1">Real-time split-plane metrics and cluster health.</p>
          </div>
          {isLoading ? (
             <RefreshCw className="w-5 h-5 text-zinc-600 animate-spin" />
          ) : (
            <div className="flex items-center gap-2 text-sm text-green-400">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              Live
            </div>
          )}
        </div>

        {isError && (
          <div className="mb-8 p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 flex items-center gap-3">
            <XCircle className="w-5 h-5" />
            <p>Failed to load admin stats. Is the FastAPI backend running?</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {/* Active GPU Workers */}
          <Card className="bg-zinc-950 border-zinc-800 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Active GPU Workers</CardTitle>
              <Server className="w-4 h-4 text-green-400" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-16 bg-zinc-800" /> : (
                <div className="text-3xl font-bold">{stats?.active_workers ?? 0}</div>
              )}
            </CardContent>
          </Card>

          {/* Redis Queue Depth */}
          <Card className="bg-zinc-950 border-zinc-800 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Jobs in Queue</CardTitle>
              <LayoutList className="w-4 h-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-16 bg-zinc-800" /> : (
                <div className="text-3xl font-bold">{stats?.queue_length ?? 0}</div>
              )}
            </CardContent>
          </Card>

          {/* Total Jobs Processed */}
          <Card className="bg-zinc-950 border-zinc-800 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Total Jobs</CardTitle>
              <Activity className="w-4 h-4 text-purple-400" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-16 bg-zinc-800" /> : (
                <div className="text-3xl font-bold">{stats?.total_jobs ?? 0}</div>
              )}
            </CardContent>
          </Card>

          {/* Completed Generations */}
          <Card className="bg-zinc-950 border-zinc-800 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Completed</CardTitle>
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-16 bg-zinc-800" /> : (
                <div className="text-3xl font-bold">{stats?.total_completed ?? 0}</div>
              )}
            </CardContent>
          </Card>

          {/* Failed Jobs */}
          <Card className="bg-zinc-950 border-zinc-800 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Failed</CardTitle>
              <XCircle className="w-4 h-4 text-red-400" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-16 bg-zinc-800" /> : (
                <div className="text-3xl font-bold">{stats?.total_failed ?? 0}</div>
              )}
            </CardContent>
          </Card>

           {/* Processing / In-Flight */}
           <Card className="bg-zinc-950 border-zinc-800 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Currently Processing</CardTitle>
              <RefreshCw className="w-4 h-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-16 bg-zinc-800" /> : (
                <div className="text-3xl font-bold">{stats?.total_processing ?? 0}</div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
