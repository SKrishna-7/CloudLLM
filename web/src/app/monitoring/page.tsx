import { UserButton } from "@clerk/nextjs";
import { Activity, Settings } from "lucide-react";

export default function MonitoringPage() {
  return (
    <div className="flex flex-col h-full bg-[#0A0A0A] relative text-zinc-100">
      <header className="flex justify-between items-center px-8 py-5 border-b border-zinc-800">
        <h1 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-400" />
          System Monitoring
        </h1>
        <div className="flex items-center gap-4">
          <button className="flex items-center gap-2 px-4 py-1.5 bg-zinc-800 text-zinc-300 rounded-full text-sm font-medium hover:bg-zinc-700 transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <UserButton appearance={{ elements: { userButtonAvatarBox: "w-8 h-8" } }} />
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-6">
        <div className="w-full h-full rounded-xl border border-zinc-800 overflow-hidden shadow-sm bg-black">
          {/* Note: In production you'd use the actual Grafana Dashboard URL with a kiosk mode parameter */}
          <iframe 
            src="http://localhost:3001/explore?orgId=1&theme=dark" 
            className="w-full h-full border-0"
            title="Grafana Monitoring"
          />
        </div>
      </main>
    </div>
  );
}
