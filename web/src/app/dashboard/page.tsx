"use client";

import { useAuth, useUser, UserButton } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Activity, ImageIcon, Zap, AlertCircle, BarChart3, Clock, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { getToken } = useAuth();
  const { user } = useUser();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["userStats"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return api.getUserStats(token, 'web');
    },
  });

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ["recentJobs"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return api.getJobs(token, 'web');
    },
  });

  const recentJobs = jobs.slice(0, 5); // Just show the top 5
  
  // Format daily activity data for recharts
  const chartData = stats?.daily_activity?.map((day: any) => ({
    name: new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }),
    count: day.count
  })) || [];

  return (
    <div className="flex flex-col h-full bg-[#050505] relative text-zinc-100 overflow-y-auto">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full space-y-8 z-0">
        
        {/* Welcome Hero */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
        >
          <div>
            <h2 className="text-3xl font-bold text-white tracking-tight">
              Welcome back, {user?.firstName || "Creator"}!
            </h2>
            <p className="text-zinc-400 mt-2">Here is a summary of your creative activity.</p>
          </div>
          
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400">Available Credits</p>
              {statsLoading ? (
                <Skeleton className="h-7 w-20 bg-zinc-800 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-white">{stats?.credits_balance || 0}</p>
              )}
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { label: "Total Generations", value: stats?.total_jobs || 0, icon: ImageIcon, color: "text-blue-400", bg: "bg-blue-400/10" },
            { label: "Completed", value: stats?.completed_jobs || 0, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-400/10" },
            { label: "Failed", value: stats?.failed_jobs || 0, icon: AlertCircle, color: "text-red-400", bg: "bg-red-400/10" }
          ].map((stat, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * (idx + 1) }}
              className="p-6 rounded-3xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm flex items-center gap-5 hover:bg-zinc-900/60 transition-colors"
            >
              <div className={`w-14 h-14 rounded-2xl ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`w-7 h-7 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">{stat.label}</p>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16 bg-zinc-800 mt-2" />
                ) : (
                  <p className="text-3xl font-bold text-white mt-1">{stat.value}</p>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          
          {/* Chart Section */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="xl:col-span-2 p-6 rounded-3xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm flex flex-col h-[400px]"
          >
            <div className="flex items-center gap-3 mb-6">
              <BarChart3 className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-semibold text-white">Activity (Last 7 Days)</h3>
            </div>
            
            <div className="flex-1 w-full min-h-0">
              {statsLoading ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Skeleton className="w-full h-full bg-zinc-800/50 rounded-xl" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#71717a" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      dy={10}
                    />
                    <YAxis 
                      stroke="#71717a" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value) => `${value}`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px', color: '#f4f4f5' }}
                      itemStyle={{ color: '#818cf8' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="count" 
                      stroke="#818cf8" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorCount)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.div>

          {/* Recent Activity */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="xl:col-span-1 p-6 rounded-3xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-sm flex flex-col"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-semibold text-white">Recent Jobs</h3>
              </div>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2">
              {jobsLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full bg-zinc-800 rounded-2xl" />
                ))
              ) : recentJobs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                  <ImageIcon className="w-12 h-12 mb-3 opacity-20" />
                  <p>No generations yet.</p>
                </div>
              ) : (
                recentJobs.map((job: any) => (
                  <div key={job.job_id} className="flex gap-4 p-3 rounded-2xl hover:bg-zinc-800/50 transition-colors border border-transparent hover:border-zinc-800">
                    <div className="w-16 h-16 rounded-xl bg-zinc-800 shrink-0 overflow-hidden relative">
                      {job.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={job.image_url} alt="thumbnail" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Activity className="w-5 h-5 text-zinc-500 animate-pulse" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col justify-center flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 font-medium truncate">{job.prompt}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                          job.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                          job.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                          'bg-indigo-500/20 text-indigo-400'
                        }`}>
                          {job.status}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {new Date(job.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>

      </main>
    </div>
  );
}
