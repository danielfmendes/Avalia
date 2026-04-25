import { useDashboard } from '@/context/DashboardContext';
import { ModeToggle } from '@/components/mode-toggle';
import { useTheme } from "@/components/theme-provider";
import {
  BarChart3, Sparkles, GitCompareArrows, BedDouble, Wallet, History, Activity,
} from 'lucide-react';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';

function Logo() {
    const { theme } = useTheme();

    const logoSrc = theme === 'dark'
        ? "/avalia_logo_icon_darkmode.png"
        : "/avalia_logo_icon.png";

    return (
        <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl">
                <img
                    src={logoSrc}
                    alt="Avalia Logo Icon"
                    className="h-full w-full object-contain"
                />
            </div>
            <span className="text-[17px] font-bold tracking-tight leading-none">Avalia</span>
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
  { id: 'signals',         label: 'Signals',      icon: <Activity className="h-3.5 w-3.5" /> },
  { id: 'compare',         label: 'Compare',      icon: <GitCompareArrows className="h-3.5 w-3.5" /> },
  { id: 'rooms',           label: 'Rooms',        icon: <BedDouble className="h-3.5 w-3.5" /> },
  { id: 'affordability',   label: 'Affordability',icon: <Wallet className="h-3.5 w-3.5" /> },
  { id: 'time-machine',    label: 'Time Machine', icon: <History className="h-3.5 w-3.5" /> },
];

function NavTabs() {
  const { page, setPage } = useDashboard();
  return (
    <nav className="flex items-center gap-0.5 rounded-full border border-border/50 bg-muted/30 p-1 backdrop-blur-sm">
      {NAV_ITEMS.map(item => {
        const active = page === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap',
              active
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
      {/* Desktop / tablet — three-column layout so the nav sits in the true center */}
      <div className="mx-auto hidden h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-6 px-6 md:grid">
        <div className="justify-self-start">
          <Logo />
        </div>
        <div className="justify-self-center">
          <NavTabs />
        </div>
        <div className="justify-self-end">
          <ModeToggle />
        </div>
      </div>

      {/* Mobile — logo + toggle, nav scrolls below */}
      <div className="md:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Logo />
          <ModeToggle />
        </div>
        <div className="border-t border-border/40 overflow-x-auto">
          <div className="flex items-center justify-center px-3 py-2">
            <NavTabs />
          </div>
        </div>
      </div>
    </header>
  );
}
