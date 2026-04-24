import { useDashboard } from '@/context/DashboardContext';
import { ModeToggle } from '@/components/mode-toggle';
import {
  BarChart3, Sparkles, GitCompareArrows, BedDouble, Wallet, History,
} from 'lucide-react';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-sm shadow-violet-500/30">
        <span className="font-black text-white text-sm tracking-tighter">A</span>
        <span className="absolute inset-0 rounded-lg ring-1 ring-inset ring-white/15" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-bold tracking-tight">Avalia</div>
        <div className="text-[10px] text-muted-foreground/70 -mt-0.5">Real Estate Intelligence</div>
      </div>
    </div>
  );
}

interface NavItem {
  id: Page;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'market-overview', label: 'Overview',     icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { id: 'ai-predictions',  label: 'Forecast',     icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: 'compare',         label: 'Compare',      icon: <GitCompareArrows className="h-3.5 w-3.5" /> },
  { id: 'rooms',           label: 'Rooms',        icon: <BedDouble className="h-3.5 w-3.5" /> },
  { id: 'affordability',   label: 'Affordability',icon: <Wallet className="h-3.5 w-3.5" /> },
  { id: 'time-machine',    label: 'Time Machine', icon: <History className="h-3.5 w-3.5" /> },
];

export function TopNav() {
  const { page, setPage } = useDashboard();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        <Logo />

        <nav className="ml-2 hidden md:flex items-center gap-0.5 overflow-x-auto">
          {NAV_ITEMS.map(item => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap',
                  active
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-1 ring-inset ring-indigo-500/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ModeToggle />
        </div>
      </div>

      {/* Mobile nav — horizontal scroll */}
      <div className="md:hidden border-t border-border/40 overflow-x-auto">
        <div className="flex gap-1 px-4 py-2">
          {NAV_ITEMS.map(item => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0',
                  active
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-1 ring-inset ring-indigo-500/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
