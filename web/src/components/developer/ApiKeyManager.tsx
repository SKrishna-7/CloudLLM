"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, KeySquare, Plus, Check } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export function ApiKeyManager() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ["apiKeys"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return api.getApiKeys(token);
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return api.generateApiKey(token);
    },
    onSuccess: (data) => {
      setNewKey(data.raw_key);
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="bg-zinc-950 border-zinc-800 w-full max-w-4xl mx-auto mt-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <KeySquare className="w-5 h-5 text-blue-400" />
              API Keys
            </CardTitle>
            <CardDescription className="text-zinc-400 mt-1">
              Manage your programmatic access keys. Do not share these keys.
            </CardDescription>
          </div>
          <Button 
            onClick={() => generateMutation.mutate()} 
            disabled={generateMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            {generateMutation.isPending ? "Generating..." : "Generate New Key"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {newKey && (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">
            <h4 className="font-semibold mb-2">New API Key Generated!</h4>
            <p className="text-sm mb-3 opacity-90">
              Please copy this key now. For security reasons, you will <strong>never</strong> be able to view it again.
            </p>
            <div className="flex items-center gap-2 bg-zinc-900 p-3 rounded-md border border-zinc-800">
              <code className="text-sm flex-1 text-zinc-300 font-mono break-all">{newKey}</code>
              <Button 
                variant="ghost" 
                size="sm" 
                className="hover:bg-zinc-800"
                onClick={() => copyToClipboard(newKey)}
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-zinc-400" />}
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-md border border-zinc-800 overflow-hidden">
          <Table>
            <TableHeader className="bg-zinc-900/50">
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Key Prefix</TableHead>
                <TableHead className="text-zinc-400 w-[150px]">Created</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="border-zinc-800">
                  <TableCell><Skeleton className="h-4 w-[250px] bg-zinc-800" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[100px] bg-zinc-800" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[50px] bg-zinc-800" /></TableCell>
                </TableRow>
              ) : apiKeys?.length === 0 ? (
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableCell colSpan={3} className="text-center text-zinc-500 py-8">
                    No API keys found. Generate one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                apiKeys?.map((key: any) => (
                  <TableRow key={key.id} className="border-zinc-800 hover:bg-zinc-900/50">
                    <TableCell className="font-mono text-sm text-zinc-300">{key.prefix}</TableCell>
                    <TableCell className="text-sm text-zinc-500">Just now</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                        onClick={async () => {
                          if (confirm("Are you sure you want to revoke this API key? This cannot be undone.")) {
                            const token = await getToken();
                            if (token) {
                              await api.deleteApiKey(key.id, token);
                              queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
                            }
                          }
                        }}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
