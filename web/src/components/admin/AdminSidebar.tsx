'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  Image as ImageIcon, 
  Key, 
  Activity,
  LineChart
} from 'lucide-react';

const navItems = [
  { name: 'Overview', href: '/admin', icon: LayoutDashboard },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Jobs', href: '/admin/jobs', icon: ImageIcon },
  { name: 'API Keys', href: '/admin/api-keys', icon: Key },
  { name: 'System Health', href: '/admin/system', icon: Activity },
  { name: 'Telemetry', href: '/admin/telemetry', icon: LineChart },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-black border-r border-white/10 z-50">
      <div className="flex h-16 items-center px-6 border-b border-white/10">
        <span className="text-sm font-semibold tracking-wider text-white uppercase">CloudLLM Admin</span>
      </div>
      
      <nav className="p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors
                ${isActive 
                  ? 'bg-white/10 text-white' 
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'}
              `}
            >
              <Icon className="w-4 h-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
