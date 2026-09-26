"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@clerk/nextjs";
import { RefreshCw, Key, ShieldOff, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

export default function ApiKeysPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  
  const { data, isLoading } = useQuery({
    queryKey: ["adminApiKeys", page],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("No token");
      return api.getAdminApiKeys(token, page) as any;
    },
    placeholderData: keepPreviousData,
  });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const token = await getToken();
      if (!token) throw new Error("No token");
      return api.revokeAdminApiKey(keyId, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminApiKeys"] });
      setRevokingId(null);
    }
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">API Keys</h2>
        <p className="text-neutral-400 mt-1">Global view of all issued API keys and their status.</p>
      </div>

      <div className="bg-[#111] border border-white/10 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-black/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Key Prefix</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Owner</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Created</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Last Used</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-neutral-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-[#111]">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <RefreshCw className="w-6 h-6 animate-spin text-neutral-500 mx-auto" />
                  </td>
                </tr>
              ) : data?.items?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-neutral-500">
                    No API keys found
                  </td>
                </tr>
              ) : (
                data?.items?.map((key: any) => (
                  <tr key={key.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-neutral-300 font-mono">
                        <Key className="w-4 h-4 text-neutral-500" />
                        {key.prefix}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-400">
                      {key.owner_email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {key.status === "Active" ? (
                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-md border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-md border bg-red-500/10 text-red-400 border-red-500/20">
                          Revoked
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-400">
                      {format(new Date(key.created_at), 'MMM d, yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-400">
                      {key.last_used_at ? format(new Date(key.last_used_at), 'MMM d, yyyy HH:mm') : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {key.status === "Active" && (
                        <button
                          onClick={() => setRevokingId(key.id)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {data?.total_pages > 1 && (
          <div className="bg-black/50 px-6 py-3 border-t border-white/10 flex items-center justify-between">
            <div className="text-sm text-neutral-400">
              Showing <span className="font-medium text-white">{(page - 1) * 25 + 1}</span> to <span className="font-medium text-white">{Math.min(page * 25, data.total)}</span> of <span className="font-medium text-white">{data.total}</span> results
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-sm disabled:opacity-50 disabled:hover:bg-white/5 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(data.total_pages, p + 1))}
                disabled={page === data.total_pages}
                className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-sm disabled:opacity-50 disabled:hover:bg-white/5 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Revocation Modal */}
      {revokingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#111] border border-white/10 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-4 text-red-400 mb-4">
              <div className="p-3 bg-red-500/10 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold">Revoke API Key?</h3>
            </div>
            
            <p className="text-neutral-400 text-sm mb-6">
              This action cannot be undone. Any applications or users currently using this API key will immediately lose access to the generation API.
            </p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRevokingId(null)}
                disabled={revokeMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => revokeMutation.mutate(revokingId)}
                disabled={revokeMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50"
              >
                {revokeMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                Yes, Revoke Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
