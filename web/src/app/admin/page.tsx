"use client";

import { useQuery } from "@tanstack/react-query";
import { Users, Server, CheckCircle, Activity, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@clerk/nextjs";
import { MetricCard } from "@/components/admin/MetricCard";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { format } from "date-fns";

const formatPrometheusData = (data: any, key: string, transform: (v: number) => number = (v) => v) => {
  if (!data?.data?.result || data.data.result.length === 0) return [];
  const series = data.data.result[0].values;
  return series.map(([timestamp, value]: [number, string]) => ({
    time: timestamp * 1000,
    [key]: transform(parseFloat(value)),
  }));
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1a1a1a] border border-white/10 p-3 rounded-lg shadow-xl text-sm z-50 relative">
        <p className="text-neutral-400 mb-1">{format(new Date(label), "HH:mm:ss")}</p>
        <p className="text-white font-mono">
          {payload[0].name}: <span className="font-semibold">{payload[0].value}</span>
        </p>
      </div>
    );
  }
  return null;
};

export default function AdminDashboard() {
  const { getToken } = useAuth();
  
  const { data: stats, isLoading } = useQuery({
    queryKey: ["adminOverview"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("No token");
      return api.getAdminOverview(token);
    },
    refetchInterval: 5000,
  });

  const fetchMetric = async (query: string) => {
    const token = await getToken();
    if (!token) throw new Error("No token");
    const end = Math.floor(Date.now() / 1000);
    const start = end - 30 * 60;
    return api.getTelemetryData(query, token, start.toString(), end.toString(), "30");
  };

  const { data: requestsData, isLoading: loadingRequests } = useQuery({
    queryKey: ["telemetry", "requests"],
    queryFn: () => fetchMetric('rate(http_requests_total{job="gateway"}[5m])'),
    refetchInterval: 10000,
  });

  const { data: vramData, isLoading: loadingVram } = useQuery({
    queryKey: ["telemetry", "vram"],
    queryFn: () => fetchMetric('cloudllm_gpu_vram_used_bytes'),
    refetchInterval: 10000,
  });

  const formattedRequests = formatPrometheusData(requestsData, "requests", (v) => Math.round(v * 100) / 100);
  const formattedVram = formatPrometheusData(vramData, "vram", (v) => Math.round(v / (1024 * 1024 * 1024) * 100) / 100);

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Dashboard Overview</h2>
        <p className="text-neutral-400 mt-1">Real-time metrics and system health for the image generation cluster.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Users"
          value={stats?.total_users ?? 0}
          icon={Users}
        />
        <MetricCard
          title="Jobs Today"
          value={stats?.jobs_today ?? 0}
          icon={Activity}
          trend={{ value: `${stats?.queue_length ?? 0} queued`, isPositive: true }}
        />
        <MetricCard
          title="Success Rate"
          value={`${stats?.success_rate?.toFixed(1) ?? 100}%`}
          icon={CheckCircle}
          trend={{ value: `${stats?.total_failed ?? 0} failed`, isPositive: false }}
        />
        <MetricCard
          title="Active GPU Workers"
          value={stats?.active_workers ?? 0}
          icon={Server}
        />
      </div>
      
      {/* Telemetry Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        
        {/* Generation Throughput (Requests Rate) */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-6 min-h-[350px] flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-semibold text-white">Gateway Request Rate</h3>
              <p className="text-xs text-neutral-500">Last 30 minutes (Requests / second)</p>
            </div>
            {loadingRequests && <RefreshCw className="w-4 h-4 animate-spin text-neutral-500" />}
          </div>
          <div className="flex-1 w-full relative">
            {formattedRequests.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={formattedRequests}>
                  <defs>
                    <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    tickFormatter={(unixTime) => format(new Date(unixTime), "HH:mm")}
                    stroke="#ffffff40" 
                    fontSize={12} 
                    tickMargin={10}
                  />
                  <YAxis stroke="#ffffff40" fontSize={12} tickFormatter={(val) => `${val}/s`} width={45} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Area type="monotone" name="Req/s" dataKey="requests" stroke="#34d399" strokeWidth={2} fillOpacity={1} fill="url(#colorReq)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-sm text-neutral-500 gap-2">
                <Activity className="w-8 h-8 opacity-20 mb-2" />
                <span>No throughput data available.</span>
              </div>
            )}
          </div>
        </div>

        {/* Live GPU VRAM */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-6 min-h-[350px] flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-semibold text-white">GPU VRAM Utilization</h3>
              <p className="text-xs text-neutral-500">Last 30 minutes (GB)</p>
            </div>
            {loadingVram && <RefreshCw className="w-4 h-4 animate-spin text-neutral-500" />}
          </div>
          <div className="flex-1 w-full relative">
            {formattedVram.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={formattedVram}>
                  <defs>
                    <linearGradient id="colorVram" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    tickFormatter={(unixTime) => format(new Date(unixTime), "HH:mm")}
                    stroke="#ffffff40" 
                    fontSize={12} 
                    tickMargin={10}
                  />
                  <YAxis stroke="#ffffff40" fontSize={12} tickFormatter={(val) => `${val}GB`} width={45} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Area type="monotone" name="VRAM (GB)" dataKey="vram" stroke="#818cf8" strokeWidth={2} fillOpacity={1} fill="url(#colorVram)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-sm text-neutral-500 gap-2">
                <Server className="w-8 h-8 opacity-20 mb-2" />
                <span>No active GPU workers detected.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
