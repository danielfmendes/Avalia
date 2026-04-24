import { BarChart3, Building2, Map, Sparkles, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/context/DashboardContext';
import { ModeToggle } from '@/components/mode-toggle';
import type { Page } from '@/lib/types';

const NAV_ITEMS: Array<{ page: Page; label: string; description: string; icon: React.ReactNode }> = [
  {
    page: 'market-overview',
    label: 'Market Overview',
    description: 'Trends & live metrics',
    icon: <BarChart3 className="h-4 w-4" />,
  },
  {
    page: 'investment-heatmap',
    label: 'Investment Heatmap',
    description: 'District price grid',
    icon: <Map className="h-4 w-4" />,
  },
  {
    page: 'ai-predictions',
    label: 'AI Predictions',
    description: 'Forecast & insights',
    icon: <Sparkles className="h-4 w-4" />,
  },
];

export function Sidebar() {
  const { page, setPage } = useDashboard();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
          <Building2 className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-tight">LisboaRE</div>
          <div className="text-[10px] text-sidebar-foreground/50">Real Estate Analytics</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-3">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
          Pages
        </p>
        {NAV_ITEMS.map(({ page: p, label, description, icon }) => (
          <button
            key={p}
            onClick={() => setPage(p)}
            className={cn(
              'group w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all',
              page === p
                ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )}
          >
            <span className={cn('shrink-0', page === p ? 'opacity-100' : 'opacity-60')}>{icon}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium">{label}</span>
              <span
                className={cn(
                  'block text-[11px] truncate',
                  page === p ? 'opacity-70' : 'text-sidebar-foreground/40',
                )}
              >
                {description}
              </span>
            </span>
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-40',
                page === p && 'opacity-60',
              )}
            />
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t p-4">
        <div className="mb-3 rounded-lg bg-sidebar-accent/50 px-3 py-2">
          <div className="text-[11px] font-medium text-sidebar-foreground/70">Lisboa District</div>
          <div className="text-[10px] text-sidebar-foreground/40">9 Municipalities • 2019–2023</div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-sidebar-foreground/40">© 2026 LisboaRE</span>
          <ModeToggle />
        </div>
      </div>
    </aside>
  );
}
