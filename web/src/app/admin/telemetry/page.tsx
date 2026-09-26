"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@clerk/nextjs";
import { RefreshCw, Activity, Server, Network, Layers } from "lucide-react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { format } from "date-fns";

// Reusable Metric Card for single values
const StatCard = ({ title, value, subtext }: { title: string, value: string | number, subtext?: string }) => (
  <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-4 flex flex-col justify-center">
    <div className="text-sm text-neutral-400 mb-1">{title}</div>
    <div className="text-2xl font-semibold text-white tracking-tight">{value}</div>
    {subtext && <div className="text-xs text-neutral-500 mt-1">{subtext}</div>}
  </div>
);

// Formatting helpers
const formatData = (data: any, key: string, transform: (v: number) => number = (v) => v) => {
  if (!data?.data?.result || data.data.result.length === 0) return [];
  const series = data.data.result[0].values;
  return series.map(([timestamp, value]: [number, string]) => ({
    time: timestamp * 1000,
    [key]: transform(parseFloat(value)),
  }));
};

const getLatestValue = (data: any, transform: (v: number) => number = (v) => v) => {
  if (!data?.data?.result || data.data.result.length === 0) return 0;
  // Handle vector queries (instant) vs matrix queries (range)
  const val = data.data.result[0].value ? data.data.result[0].value[1] : (data.data.result[0].values ? data.data.result[0].values.slice(-1)[0][1] : 0);
  return transform(parseFloat(val));
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-black border border-white/20 p-3 rounded-md shadow-xl text-xs z-50">
        <p className="text-neutral-400 mb-1">{format(new Date(label), "HH:mm:ss")}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-white font-mono">
            {p.name}: <span className="font-semibold" style={{ color: p.color }}>{p.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function TelemetryPage() {
  const { getToken } = useAuth();

  const usePrometheus = (key: string, query: string, isRange = true) => {
    return useQuery({
      queryKey: ["telemetry", key],
      queryFn: async () => {
        const token = await getToken();
        if (!token) throw new Error("No token");
        if (isRange) {
          const end = Math.floor(Date.now() / 1000);
          const start = end - 30 * 60; // 30 mins
          return api.getTelemetryData(query, token, start.toString(), end.toString(), "30");
        } else {
          return api.getTelemetryData(query, token);
        }
      },
      refetchInterval: 10000,
    });
  };

  // 1. API Metrics
  const { data: apiReqRate } = usePrometheus("api_rate", 'sum(rate(http_requests_total{job="gateway"}[1m]))');
  const { data: apiTotal } = usePrometheus("api_total", 'sum(http_requests_total{job="gateway"})', false);
  const { data: apiP50 } = usePrometheus("api_p50", 'histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket{job="gateway"}[5m])) by (le))', false);
  const { data: apiP95 } = usePrometheus("api_p95", 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="gateway"}[5m])) by (le))', false);
  const { data: apiP99 } = usePrometheus("api_p99", 'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job="gateway"}[5m])) by (le))', false);
  const { data: api4xx } = usePrometheus("api_4xx", 'sum(rate(http_requests_total{job="gateway",status=~"4.."}[1m]))', false);
  const { data: api5xx } = usePrometheus("api_5xx", 'sum(rate(http_requests_total{job="gateway",status=~"5.."}[1m]))', false);

  // 2. Image Generation Metrics
  const { data: genRate } = usePrometheus("gen_rate", 'sum(rate(cloudllm_generations_total[5m])) * 60'); // Gens/min
  const { data: genTotal } = usePrometheus("gen_total", 'sum(cloudllm_generations_total)', false);
  const { data: genP50 } = usePrometheus("gen_p50", 'histogram_quantile(0.50, sum(rate(cloudllm_generation_duration_seconds_bucket[5m])) by (le))', false);
  const { data: genP99 } = usePrometheus("gen_p99", 'histogram_quantile(0.99, sum(rate(cloudllm_generation_duration_seconds_bucket[5m])) by (le))', false);
  const { data: genOOM } = usePrometheus("gen_oom", 'sum(cloudllm_oom_errors_total)', false);
  const { data: genFailed } = usePrometheus("gen_failed", 'sum(cloudllm_generations_total{status="failed"})', false);
  const { data: genDurationHist } = usePrometheus("gen_dur_hist", 'histogram_quantile(0.95, sum(rate(cloudllm_generation_duration_seconds_bucket[5m])) by (le))');

  // 3. GPU Metrics
  const { data: gpuUtil } = usePrometheus("gpu_util", 'cloudllm_gpu_utilization_percent');
  const { data: gpuVram } = usePrometheus("gpu_vram", 'cloudllm_gpu_vram_used_bytes');
  const { data: gpuTemp } = usePrometheus("gpu_temp", 'cloudllm_gpu_temperature_celsius');
  const { data: gpuPower } = usePrometheus("gpu_power", 'cloudllm_gpu_power_usage_watts', false);
  const { data: gpuClock } = usePrometheus("gpu_clock", 'cloudllm_gpu_clock_speed_mhz', false);
  const { data: gpuStatus } = usePrometheus("gpu_status", 'cloudllm_gpu_worker_status', false);

  // 4. Queue Metrics
  const { data: qDepth } = usePrometheus("q_depth", 'cloudllm_jobs_queued');
  const { data: qProcessing } = usePrometheus("q_processing", 'cloudllm_jobs_processing_current', false);
  const { data: qCompleted } = usePrometheus("q_completed", 'cloudllm_jobs_completed_total', false);
  const { data: qFailed } = usePrometheus("q_failed", 'cloudllm_jobs_failed_total', false);

  return (
    <div className="space-y-12 animate-in fade-in duration-500 pb-12">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <Activity className="w-6 h-6 text-indigo-400" /> Advanced Telemetry
        </h2>
        <p className="text-neutral-400 mt-1">Comprehensive APM, hardware, and queue profiling.</p>
      </div>

      {/* 1. API Metrics */}
      <section>
        <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
          <Network className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-white">API Gateway</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          <StatCard title="Total Requests" value={getLatestValue(apiTotal)} />
          <StatCard title="P50 Latency" value={`${(getLatestValue(apiP50) * 1000).toFixed(0)} ms`} />
          <StatCard title="P95 Latency" value={`${(getLatestValue(apiP95) * 1000).toFixed(0)} ms`} />
          <StatCard title="P99 Latency" value={`${(getLatestValue(apiP99) * 1000).toFixed(0)} ms`} />
          <StatCard title="4xx Errors/sec" value={getLatestValue(api4xx).toFixed(2)} />
          <StatCard title="5xx Errors/sec" value={getLatestValue(api5xx).toFixed(2)} />
          <StatCard title="Success Rate" value={`${apiTotal ? (((getLatestValue(apiTotal) - getLatestValue(api5xx)) / getLatestValue(apiTotal)) * 100).toFixed(2) : 100}%`} />
        </div>
        <div className="bg-[#111] border border-white/10 rounded-xl p-6 h-64">
          <h4 className="text-sm font-semibold text-neutral-300 mb-4">Requests / Second</h4>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formatData(apiReqRate, "rate", v => Math.round(v * 100)/100)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="time" tickFormatter={(v) => format(new Date(v), "HH:mm")} stroke="#ffffff40" fontSize={12} />
              <YAxis stroke="#ffffff40" fontSize={12} width={40} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" name="Req/s" dataKey="rate" stroke="#3b82f6" fillOpacity={0.2} fill="#3b82f6" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 2. Image Generation Metrics */}
      <section>
        <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
          <Layers className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-semibold text-white">Image Generation Inference</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <StatCard title="Total Generations" value={getLatestValue(genTotal)} />
          <StatCard title="Gens / Minute" value={getLatestValue(genRate).toFixed(1)} />
          <StatCard title="P50 Time" value={`${getLatestValue(genP50).toFixed(2)} s`} />
          <StatCard title="P99 Time" value={`${getLatestValue(genP99).toFixed(2)} s`} />
          <StatCard title="Failed Gens" value={getLatestValue(genFailed)} />
          <StatCard title="OOM Errors" value={getLatestValue(genOOM)} />
        </div>
        <div className="bg-[#111] border border-white/10 rounded-xl p-6 h-64">
          <h4 className="text-sm font-semibold text-neutral-300 mb-4">P95 Generation Duration (Seconds)</h4>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formatData(genDurationHist, "dur", v => Math.round(v * 100)/100)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="time" tickFormatter={(v) => format(new Date(v), "HH:mm")} stroke="#ffffff40" fontSize={12} />
              <YAxis stroke="#ffffff40" fontSize={12} width={40} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" name="P95 Duration" dataKey="dur" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 3. GPU Metrics */}
      <section>
        <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
          <Server className="w-5 h-5 text-fuchsia-400" />
          <h3 className="text-lg font-semibold text-white">GPU Hardware (PyTorch NVML)</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <StatCard title="Worker Status" value={getLatestValue(gpuStatus) === 1 ? 'Busy' : 'Idle'} />
          <StatCard title="VRAM Used" value={`${(getLatestValue(gpuVram, v => v / 1024/1024/1024)).toFixed(1)} GB`} />
          <StatCard title="GPU Temp" value={`${getLatestValue(gpuTemp)} °C`} />
          <StatCard title="Power Draw" value={`${getLatestValue(gpuPower).toFixed(0)} W`} />
          <StatCard title="Clock Speed" value={`${getLatestValue(gpuClock)} MHz`} />
          <StatCard title="Idle Time" value="--" subtext="Calculated via traces" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#111] border border-white/10 rounded-xl p-6 h-64">
            <h4 className="text-sm font-semibold text-neutral-300 mb-4">GPU Utilization %</h4>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={formatData(gpuUtil, "util")}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="time" tickFormatter={(v) => format(new Date(v), "HH:mm")} stroke="#ffffff40" fontSize={12} />
                <YAxis stroke="#ffffff40" fontSize={12} width={40} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" name="Util %" dataKey="util" stroke="#d946ef" fillOpacity={0.2} fill="#d946ef" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-[#111] border border-white/10 rounded-xl p-6 h-64">
            <h4 className="text-sm font-semibold text-neutral-300 mb-4">VRAM Usage</h4>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={formatData(gpuVram, "vram", v => v / 1024/1024/1024)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="time" tickFormatter={(v) => format(new Date(v), "HH:mm")} stroke="#ffffff40" fontSize={12} />
                <YAxis stroke="#ffffff40" fontSize={12} width={40} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" name="VRAM (GB)" dataKey="vram" stroke="#8b5cf6" fillOpacity={0.2} fill="#8b5cf6" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* 4. Queue Dynamics */}
      <section>
        <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
          <Activity className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-semibold text-white">Queue & Scheduler</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <StatCard title="Current Depth" value={getLatestValue(qDepth)} />
          <StatCard title="Jobs Processing" value={getLatestValue(qProcessing)} />
          <StatCard title="Total Completed" value={getLatestValue(qCompleted)} />
          <StatCard title="Total Failed" value={getLatestValue(qFailed)} />
          <StatCard title="Avg Wait" value="--" subtext="Available in Logs" />
          <StatCard title="Oldest Job" value="--" subtext="Available in Logs" />
        </div>
        <div className="bg-[#111] border border-white/10 rounded-xl p-6 h-64">
          <h4 className="text-sm font-semibold text-neutral-300 mb-4">Queue Depth Over Time</h4>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formatData(qDepth, "depth")}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="time" tickFormatter={(v) => format(new Date(v), "HH:mm")} stroke="#ffffff40" fontSize={12} />
              <YAxis stroke="#ffffff40" fontSize={12} width={40} />
              <Tooltip content={<CustomTooltip />} />
              <Bar name="Queue Depth" dataKey="depth" fill="#fbbf24" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

    </div>
  );
}
