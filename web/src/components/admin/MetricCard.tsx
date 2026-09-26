'use client';

import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
}

export function MetricCard({ title, value, icon: Icon, trend }: MetricCardProps) {
  return (
    <div className="bg-[#111] border border-white/10 rounded-lg p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-400">{title}</h3>
        <Icon className="h-4 w-4 text-neutral-500" />
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-3xl font-semibold text-white tracking-tight">{value}</span>
        {trend && (
          <span className={`text-xs font-medium ${trend.isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}
