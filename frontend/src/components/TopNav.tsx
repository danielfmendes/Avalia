import { useEffect, useState } from 'react';
import { useDashboard } from '@/context/DashboardContext';
import { ModeToggle } from '@/components/mode-toggle';
import { useTheme } from "@/components/theme-provider";
import {
  BarChart3, Sparkles, GitCompareArrows, BedDouble, Wallet, History, Activity, Menu, X,
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

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { page, setPage } = useDashboard();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <div className="absolute inset-x-3 top-3 rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo />
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/60 text-foreground/80 hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-t border-border/40 p-2">
          <nav className="flex flex-col">
            {NAV_ITEMS.map(item => {
              const active = page === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setPage(item.id);
                    onClose();
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-background/80 text-foreground ring-1 ring-border/60 shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                  )}
                >
                  <span className="[&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}

export function TopNav() {
  const [menuOpen, setMenuOpen] = useState(false);

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

      {/* Mobile — logo + hamburger + theme toggle */}
      <div className="md:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <ModeToggle />
            <button
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/60 text-foreground/80 backdrop-blur-xl hover:text-foreground"
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
