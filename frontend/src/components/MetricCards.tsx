import { useMemo } from 'react';
import { Home, TrendingUp, Ruler, ArrowUpRight, ArrowDownRight, AlertCircle, Loader2 } from 'lucide-react';
import { useDashboard } from '@/context/DashboardContext';
import { latestMonth, minusYear, wavg } from '@/lib/dataUtils';
import { cn } from '@/lib/utils';

function formatCurrency(value: number, compact = false): string {
  if (compact && value >= 1_000_000) return `€${(value / 1_000_000).toFixed(2)}M`;
  if (compact && value >= 1_000) return `€${(value / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatArea(value: number): string {
  return `${Math.round(value)} m²`;
}

interface CardDef {
  title: string;
  icon: React.ReactNode;
  value: string;
  sub: string;
  change: number | null;
  accent: 'indigo' | 'emerald' | 'amber';
}

const ACCENT_CLASSES: Record<CardDef['accent'], string> = {
  indigo: 'from-indigo-500/60 via-indigo-500/20',
  emerald: 'from-emerald-500/60 via-emerald-500/20',
  amber: 'from-amber-500/60 via-amber-500/20',
};

export function MetricCards() {
  const { filteredData, tipoVenda, metric, drilldown, isDrillLoading } = useDashboard();

  const stats = useMemo(() => {
    const latest = latestMonth(filteredData);
    if (!latest) {
      return {
        empty: true as const,
        latest: null,
        totalRows: 0, avgArea: 0, avgM2: 0, avgPreco: 0,
        changeRows: 0, changeArea: 0, changeM2: 0, changePreco: 0,
      };
    }
    const prevLabel = minusYear(latest);
    const current = filteredData.filter(r => r.mes_ano === latest);
    const prev = filteredData.filter(r => r.mes_ano === prevLabel);

    const totalRows = current.reduce((s, r) => s + r.total_rows, 0);
    const avgArea = wavg(current, 'avg_area');
    const avgM2 = wavg(current, 'avg_m2');
    const avgPreco = wavg(current, 'avg_preco');

    const prevRows = prev.reduce((s, r) => s + r.total_rows, 0);
    const prevArea = wavg(prev, 'avg_area');
    const prevM2 = wavg(prev, 'avg_m2');
    const prevPreco = wavg(prev, 'avg_preco');

    const pctChange = (cur: number, pv: number) => (pv > 0 ? ((cur - pv) / pv) * 100 : 0);

    return {
      empty: false as const,
      latest,
      totalRows, avgArea, avgM2, avgPreco,
      changeRows: pctChange(totalRows, prevRows),
      changeArea: pctChange(avgArea, prevArea),
      changeM2: pctChange(avgM2, prevM2),
      changePreco: pctChange(avgPreco, prevPreco),
    };
  }, [filteredData]);

  // Still fetching scoped data → show a skeleton row rather than flashing 0s
  if (stats.empty && isDrillLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm dark:bg-card/40"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 animate-pulse rounded bg-muted-foreground/15" />
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/50" />
            </div>
            <div className="mt-3 h-7 w-32 animate-pulse rounded bg-muted-foreground/15" />
            <div className="mt-2.5 h-3 w-24 animate-pulse rounded bg-muted-foreground/10" />
          </div>
        ))}
      </div>
    );
  }

  // Graceful fallback when drilled into a region with no data
  if (stats.empty) {
    const region = drilldown.freguesia
      ? `${drilldown.freguesia}, ${drilldown.municipio}`
      : drilldown.municipio ?? 'this region';
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-8">
        <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-center">
          <div className="rounded-full bg-muted/60 p-3">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-sm font-semibold">Not enough data for this region</div>
          <div className="text-xs text-muted-foreground">
            No records found for <span className="font-medium text-foreground">{region}</span> under
            the current view ({tipoVenda}). Try selecting a different region or toggle the market type.
          </div>
        </div>
      </div>
    );
  }

  // Format the latest-month label like "Dec 2023"
  const [y, m] = stats.latest!.split('-');
  const latestLabel = new Date(parseInt(y), parseInt(m) - 1)
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const cards: CardDef[] = [
    {
      title: 'Total Listings',
      icon: <Home className="h-3.5 w-3.5" />,
      value: stats.totalRows.toLocaleString('pt-PT'),
      sub: `Active in ${latestLabel}`,
      change: stats.changeRows,
      accent: 'indigo',
    },
    {
      title: 'Avg Area',
      icon: <Ruler className="h-3.5 w-3.5" />,
      value: formatArea(stats.avgArea),
      sub: 'Per listing',
      change: stats.changeArea,
      accent: 'emerald',
    },
    {
      title: metric === 'avg_m2'
        ? (tipoVenda === 'compra' ? 'Price / m²' : 'Rent / m² / mo')
        : (tipoVenda === 'compra' ? 'Avg Sale Price' : 'Avg Monthly Rent'),
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      value: metric === 'avg_m2'
        ? `€${Math.round(stats.avgM2).toLocaleString('pt-PT')}`
        : formatCurrency(stats.avgPreco, true),
      sub: `YoY vs ${latestLabel.replace(/\d{4}/, y2 => String(parseInt(y2) - 1))}`,
      change: metric === 'avg_m2' ? stats.changeM2 : stats.changePreco,
      accent: 'amber',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map(({ title, icon, value, sub, change, accent }) => (
        <div
          key={title}
          className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-5 backdrop-blur-sm transition-all hover:border-border hover:shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.18)] dark:bg-card/40 dark:hover:bg-card/60"
        >
          {/* Top accent gradient line */}
          <div
            className={cn(
              'absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent',
              ACCENT_CLASSES[accent],
            )}
          />

          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">
              {title}
            </span>
            <span className="text-muted-foreground/50">{icon}</span>
          </div>

          <div className="mt-3 text-[28px] font-semibold leading-none tracking-tight tabular-nums">
            {value}
          </div>

          <div className="mt-2.5 flex items-center gap-2 text-[11px]">
            {change !== null && Math.abs(change) >= 0.05 && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                  change > 0
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                )}
              >
                {change > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(change).toFixed(1)}%
              </span>
            )}
            <span className="text-muted-foreground">{sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
