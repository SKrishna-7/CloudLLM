import { ApiKeyManager } from "@/components/developer/ApiKeyManager";
import { DeveloperDocs } from "@/components/developer/DeveloperDocs";
import { UserButton } from "@clerk/nextjs";
import { Code2, Settings } from "lucide-react";

export default function DeveloperPage() {
  return (
    <div className="flex flex-col h-full bg-[#0A0A0A] relative text-zinc-100">
      <header className="flex justify-between items-center px-8 py-5 border-b border-zinc-800">
        <h1 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
          <Code2 className="w-5 h-5 text-indigo-400" />
          Developer API
        </h1>
        <div className="flex items-center gap-4">
          <button className="flex items-center gap-2 px-4 py-1.5 bg-zinc-800 text-zinc-300 rounded-full text-sm font-medium hover:bg-zinc-700 transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <UserButton appearance={{ elements: { userButtonAvatarBox: "w-8 h-8" } }} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-10">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="space-y-4">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Programmatic Access
            </h2>
            <p className="text-zinc-400 text-lg">
              Generate API keys to interact with CloudLLM directly from your scripts or load testers.
            </p>
          </div>
          <ApiKeyManager />
          <div className="pt-8 border-t border-zinc-800">
            <DeveloperDocs />
          </div>
        </div>
      </main>
    </div>
  );
}
