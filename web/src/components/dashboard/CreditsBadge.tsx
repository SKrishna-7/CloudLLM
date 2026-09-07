"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/api";

export function CreditsBadge() {
  const { getToken, isLoaded } = useAuth();

  const { data: user, isLoading } = useQuery({
    queryKey: ["userMe"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return api.getMe(token);
    },
    enabled: isLoaded,
    refetchInterval: 5000, // Sync credits every 5 seconds
  });

  return (
    <div className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-zinc-300">
      {isLoading ? (
        <span className="text-zinc-500 animate-pulse">...</span>
      ) : (
        <span className="text-blue-400 font-bold">{user?.credits_balance ?? 0}</span>
      )}{" "}
      Credits
    </div>
  );
}
