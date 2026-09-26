'use client';

import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';

export function AdminHeader() {
  const pathname = usePathname();
  
  // Create simple breadcrumbs from pathname
  const paths = pathname.split('/').filter(Boolean);
  
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-white/10 bg-black/80 backdrop-blur-sm px-6">
      <div className="flex flex-1 items-center gap-x-4 self-stretch lg:gap-x-6">
        <div className="flex flex-1 items-center gap-2 text-sm text-neutral-400">
          {paths.map((path, index) => (
            <div key={path} className="flex items-center gap-2">
              <span className={`capitalize ${index === paths.length - 1 ? 'text-white' : ''}`}>
                {path.replace('-', ' ')}
              </span>
              {index < paths.length - 1 && <span>/</span>}
            </div>
          ))}
        </div>
        
        <div className="flex items-center gap-x-4 lg:gap-x-6">
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    </header>
  );
}
