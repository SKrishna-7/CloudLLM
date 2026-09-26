import { ApiKeyManager } from "@/components/developer/ApiKeyManager";
import { DeveloperDocs } from "@/components/developer/DeveloperDocs";
import { DeveloperDashboard } from "@/components/developer/DeveloperDashboard";
import { UserButton } from "@clerk/nextjs";
import { Code2, Settings } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function DeveloperPage() {
  return (
    <div className="flex flex-col h-full bg-[#0A0A0A] relative text-zinc-100">
      <main className="flex-1 overflow-y-auto px-8 py-10">
        <div className="max-w-5xl mx-auto space-y-8">
          
          <Tabs defaultValue="dashboard" className="w-full">
            <div className="flex items-center justify-between mb-8 border-b border-zinc-800/80 pb-px">
              <TabsList className="bg-transparent h-10 p-0 space-x-6">
                <TabsTrigger 
                  value="dashboard" 
                  className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 data-[state=active]:border-indigo-400 text-zinc-400 hover:text-zinc-300 rounded-none pb-3 px-1"
                >
                  Dashboard
                </TabsTrigger>
                <TabsTrigger 
                  value="keys" 
                  className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 data-[state=active]:border-indigo-400 text-zinc-400 hover:text-zinc-300 rounded-none pb-3 px-1"
                >
                  API Keys
                </TabsTrigger>
                <TabsTrigger 
                  value="docs" 
                  className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 data-[state=active]:border-indigo-400 text-zinc-400 hover:text-zinc-300 rounded-none pb-3 px-1"
                >
                  Documentation
                </TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="dashboard" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
              <DeveloperDashboard />
            </TabsContent>
            
            <TabsContent value="keys" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
              <div className="max-w-4xl mx-auto space-y-8">
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-white tracking-tight">API Keys</h3>
                  <p className="text-zinc-400">
                    Generate and manage your secret API keys to authenticate programmatic requests.
                  </p>
                </div>
                <ApiKeyManager />
              </div>
            </TabsContent>
            
            <TabsContent value="docs" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
              <DeveloperDocs />
            </TabsContent>
          </Tabs>

        </div>
      </main>
    </div>
  );
}
