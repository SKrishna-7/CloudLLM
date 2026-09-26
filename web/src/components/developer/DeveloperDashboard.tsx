"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Check, X, ArrowRight } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from "recharts";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

export function DeveloperDashboard() {
  const { getToken } = useAuth();

  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ["userStats"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return api.getUserStats(token, 'api');
    },
  });

  const { data: jobs = [], isLoading: isJobsLoading } = useQuery({
    queryKey: ["recentJobs"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return api.getJobs(token, 'api');
    },
  });

  const isLoading = isStatsLoading || isJobsLoading;

  const totalCalls = stats?.total_jobs || 0;
  const successRate = totalCalls > 0 ? ((stats?.completed_jobs || 0) / totalCalls) * 100 : 0;
  
  // Calculate average latency from recent completed jobs
  const completedJobs = jobs.filter((j: any) => j.status === 'completed' && j.completed_at && j.created_at);
  const avgLatency = completedJobs.length > 0 
    ? completedJobs.reduce((acc: number, j: any) => acc + (new Date(j.completed_at).getTime() - new Date(j.created_at).getTime()) / 1000, 0) / completedJobs.length 
    : 0.0;

  const chartData = stats?.daily_activity?.map((day: any) => ({
    name: day.date,
    count: day.count
  })) || [];

  const todayCount = chartData[chartData.length - 1]?.count || 0;
  const yesterdayCount = chartData[chartData.length - 2]?.count || 0;
  let trend = 0;
  if (yesterdayCount > 0) {
    trend = ((todayCount - yesterdayCount) / yesterdayCount) * 100;
  } else if (todayCount > 0) {
    trend = 100;
  }
  const isTrendPositive = trend >= 0;
  const trendStr = (isTrendPositive ? "+" : "") + trend.toFixed(1) + "%";

  return (
    <div className="w-full max-w-5xl mx-auto mt-4 space-y-12 font-mono text-zinc-300">
      
      {/* Top Header */}
      <div className="flex items-center justify-between text-sm">
        <h2 className="uppercase tracking-widest text-zinc-400">Metrics</h2>
        <button className="flex items-center gap-2 hover:text-white transition-colors">
          Last 7 days <span className="text-[10px]">▼</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border border-dashed border-zinc-700 p-4 relative group hover:border-zinc-500 transition-colors bg-[#0D0D0D]">
          <div className="text-zinc-500 text-xs uppercase tracking-widest mb-4">API Calls</div>
          {isLoading ? <Skeleton className="h-8 w-20 bg-zinc-800" /> : (
            <>
              <div className="text-2xl text-zinc-100">{totalCalls.toLocaleString()}</div>
              <div className={`text-xs mt-1 ${isTrendPositive ? 'text-emerald-400' : 'text-red-400'}`}>{trendStr}</div>
            </>
          )}
        </div>
        <div className="border border-dashed border-zinc-700 p-4 relative group hover:border-zinc-500 transition-colors bg-[#0D0D0D]">
          <div className="text-zinc-500 text-xs uppercase tracking-widest mb-4">Success Rate</div>
          {isLoading ? <Skeleton className="h-8 w-20 bg-zinc-800" /> : (
            <>
              <div className="text-2xl text-zinc-100">{successRate.toFixed(1)}%</div>
            </>
          )}
        </div>
        <div className="border border-dashed border-zinc-700 p-4 relative group hover:border-zinc-500 transition-colors bg-[#0D0D0D]">
          <div className="text-zinc-500 text-xs uppercase tracking-widest mb-4">Avg Latency</div>
          {isLoading ? <Skeleton className="h-8 w-20 bg-zinc-800" /> : (
            <>
              <div className="text-2xl text-zinc-100">{avgLatency.toFixed(1)}s</div>
            </>
          )}
        </div>
        <div className="border border-dashed border-zinc-700 p-4 relative group hover:border-zinc-500 transition-colors bg-[#0D0D0D]">
          <div className="text-zinc-500 text-xs uppercase tracking-widest mb-4">Credits Used</div>
          {isLoading ? <Skeleton className="h-8 w-20 bg-zinc-800" /> : (
            <>
              <div className="text-2xl text-zinc-100">{(stats?.completed_jobs || 0).toLocaleString()}</div>
            </>
          )}
        </div>
      </div>

      {/* Graph Area */}
      <div className="space-y-4">
        <h2 className="uppercase tracking-widest text-zinc-400 text-sm">API Requests</h2>
        <div className="border border-dashed border-zinc-700 p-4 h-48 bg-[#0D0D0D]">
          {isLoading ? (
            <Skeleton className="w-full h-full bg-zinc-800/50" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="name" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                <Area 
                  type="step" 
                  dataKey="count" 
                  stroke="#A1A1AA" 
                  fill="transparent" 
                  strokeWidth={1} 
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom Area */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Usage Box */}
        <div className="space-y-4">
          <h2 className="uppercase tracking-widest text-zinc-400 text-sm">Usage</h2>
          <div className="border border-dashed border-zinc-700 p-5 space-y-6 bg-[#0D0D0D]">
            <div>
              <div className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Images generated</div>
              {isLoading ? <Skeleton className="h-6 w-16 bg-zinc-800" /> : <div className="text-xl text-zinc-200">{totalCalls.toLocaleString()}</div>}
            </div>
            <div>
              <div className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Credits remaining</div>
              {isLoading ? <Skeleton className="h-6 w-16 bg-zinc-800" /> : <div className="text-xl text-zinc-200">{(stats?.credits_balance || 0).toLocaleString()}</div>}
            </div>
          </div>
        </div>

        {/* Recent Requests Box */}
        <div className="space-y-4">
          <h2 className="uppercase tracking-widest text-zinc-400 text-sm">Recent Requests</h2>
          <div className="border border-dashed border-zinc-700 p-5 bg-[#0D0D0D] flex flex-col justify-between min-h-[170px]">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-full bg-zinc-800" />
                <Skeleton className="h-5 w-full bg-zinc-800" />
                <Skeleton className="h-5 w-full bg-zinc-800" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-zinc-500 text-sm">No recent requests</div>
            ) : (
              <div className="space-y-3 text-sm">
                {jobs.slice(0, 4).map((job: any) => {
                  const latency = job.completed_at && job.created_at 
                    ? ((new Date(job.completed_at).getTime() - new Date(job.created_at).getTime()) / 1000).toFixed(1) + "s"
                    : "0.0s";
                  return (
                    <div key={job.job_id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-400">gen_{job.job_id.substring(0, 4)}</span>
                        {job.status === "completed" ? (
                          <Check className="w-3.5 h-3.5 text-zinc-300" />
                        ) : job.status === "failed" ? (
                          <X className="w-3.5 h-3.5 text-zinc-500" />
                        ) : (
                          <span className="w-3.5 h-3.5 flex items-center justify-center text-xs text-zinc-400">...</span>
                        )}
                      </div>
                      <span className="text-zinc-400">{job.status === "failed" ? "err" : latency}</span>
                    </div>
                  );
                })}
              </div>
            )}
            
            <button className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors mt-6 text-sm">
              View all <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
