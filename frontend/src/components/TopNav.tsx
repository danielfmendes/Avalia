import { BarChart3, Map, Sparkles, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/context/DashboardContext';
import { ModeToggle } from '@/components/mode-toggle';
import type { Page } from '@/lib/types';

const NAV_ITEMS: Array<{ page: Page; label: string; icon: React.ReactNode }> = [
  { page: 'market-overview',     label: 'Overview',    icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { page: 'investment-heatmap',  label: 'Heatmap',     icon: <Map className="h-3.5 w-3.5" /> },
  { page: 'ai-predictions',      label: 'Predictions', icon: <Sparkles className="h-3.5 w-3.5" /> },
];

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

export function TopNav() {
  const { page, setPage, tipoVenda, setTipoVenda } = useDashboard();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        <Logo />

        {/* Tabbed nav */}
        <nav className="hidden md:flex items-center rounded-full border border-border/60 bg-muted/30 p-0.5">
          {NAV_ITEMS.map(({ page: p, label, icon }) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={cn(
                'relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all',
                page === p
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/40'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className={cn(page === p ? 'opacity-100' : 'opacity-60')}>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        {/* Mobile nav — simple select */}
        <div className="md:hidden relative">
          <select
            value={page}
            onChange={e => setPage(e.target.value as Page)}
            className="appearance-none rounded-full border border-border/60 bg-muted/30 py-1.5 pl-3 pr-8 text-xs font-medium"
          >
            {NAV_ITEMS.map(n => (
              <option key={n.page} value={n.page}>{n.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Compra / Arrendamento global toggle */}
          <div className="hidden sm:flex rounded-full border border-border/60 bg-muted/30 p-0.5">
            {(['compra', 'arrendamento'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTipoVenda(t)}
                className={cn(
                  'rounded-full px-3 py-1 text-[11px] font-medium capitalize transition-colors',
                  tipoVenda === t
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border/40'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
