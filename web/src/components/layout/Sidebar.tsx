"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  Code2, 
  Activity, 
  MoreHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();

  const navigation = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Developer API', href: '/developer', icon: Code2 },
    { name: 'Monitoring', href: '/monitoring', icon: Activity },
  ];

  return (
    <div className="w-[280px] bg-[#000000] text-zinc-400 h-screen flex flex-col border-r border-zinc-800 shrink-0 font-sans hidden md:flex rounded-l-2xl">
      <div className="p-5 flex items-center justify-between">
        <div className="w-8 h-8 flex items-center justify-center">
          {/* Hexagon dots logo */}
          <div className="grid grid-cols-2 gap-1 rotate-45">
            <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
            <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
            <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
            <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
          </div>
        </div>
      </div>

      <nav className="px-4 py-2 space-y-1 mt-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive 
                  ? 'bg-zinc-800 text-white shadow-sm' 
                  : 'hover:bg-zinc-800/50 hover:text-white'
              )}
            >
              <item.icon className="w-[18px] h-[18px]" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
