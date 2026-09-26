"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@clerk/nextjs";
import { RefreshCw, Search, Clock, Zap } from "lucide-react";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  queued: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  processing: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20"
};

export default function JobsPage() {
  const { getToken } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  
  const { data, isLoading } = useQuery({
    queryKey: ["adminJobs", page, search],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("No token");
      return api.getAdminJobs(token, page, search);
    },
    keepPreviousData: true,
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">All Jobs</h2>
          <p className="text-neutral-400 mt-1">Global view of all generations across the system.</p>
        </div>
        
        <div className="relative w-full sm:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-neutral-500" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-white/10 rounded-md leading-5 bg-black text-neutral-300 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 sm:text-sm"
            placeholder="Search by User Email or Job ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="bg-[#111] border border-white/10 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-black/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Preview</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Job Details</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">User</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Source</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Timing</th>
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
                    No jobs found
                  </td>
                </tr>
              ) : (
                data?.items?.map((job: any) => (
                  <tr key={job.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {job.image_url ? (
                        <div className="w-12 h-12 rounded overflow-hidden border border-white/10">
                          <img src={job.image_url} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded bg-white/5 border border-white/10 flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-neutral-600" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 max-w-xs">
                        <span className="text-xs font-mono text-neutral-500 truncate" title={job.id}>{job.id.split('-')[0]}...</span>
                        <span className="text-sm text-neutral-300 truncate" title={job.prompt}>{job.prompt}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-400">
                      {job.user_email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                        {job.source === 'api' ? <Zap className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                        <span className="uppercase">{job.source}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-md border ${statusColors[job.status]}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-400">
                      <div className="flex flex-col gap-1">
                        <span>{format(new Date(job.created_at), 'MMM d, HH:mm:ss')}</span>
                        {job.duration && (
                          <div className="flex items-center gap-1 text-xs text-neutral-500">
                            <Clock className="w-3 h-3" />
                            {job.duration.toFixed(1)}s
                          </div>
                        )}
                      </div>
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
    </div>
  );
}

// Simple icons for missing lucide imports
function ImageIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}
function Monitor(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}
