import { useMemo } from 'react';
import {
  Home, TrendingUp, Ruler, ArrowUpRight, ArrowDownRight,
  AlertCircle, Loader2, Percent,
} from 'lucide-react';
import { useDashboard } from '@/context/DashboardContext';
import { Sparkline } from '@/components/Sparkline';
import {
  aggregateByMonth, filterRecords, getMunicipioStats,
  latestMonth, minusYear, wavg,
} from '@/lib/dataUtils';
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

const ACCENT: Record<string, { line: string; from: string; via: string; dot: string }> = {
  indigo:  { line: '#6366f1', from: 'from-indigo-500/60',  via: 'via-indigo-500/20',  dot: 'bg-indigo-500' },
  emerald: { line: '#10b981', from: 'from-emerald-500/60', via: 'via-emerald-500/20', dot: 'bg-emerald-500' },
  amber:   { line: '#f59e0b', from: 'from-amber-500/60',   via: 'via-amber-500/20',   dot: 'bg-amber-500' },
  fuchsia: { line: '#d946ef', from: 'from-fuchsia-500/60', via: 'via-fuchsia-500/20', dot: 'bg-fuchsia-500' },
};

interface CardDef {
  title: string;
  icon: React.ReactNode;
  value: string;
  sub: string;
  change: number | null;
  accent: keyof typeof ACCENT;
  spark: Array<{ value: number }>;
  rank?: { position: number; total: number } | null;
}

export function MetricCards() {
  const {
    filteredData, allData, districtData, tipoVenda, metric,
    drilldown, isDrillLoading,
  } = useDashboard();

  const stats = useMemo(() => {
    const latest = latestMonth(filteredData);
    if (!latest) {
      return { empty: true as const };
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

  // Monthly series for sparklines — independent of "latest month" stat lookup.
  const monthlyM2 = useMemo(
    () => aggregateByMonth(filteredData, 'avg_m2').slice(-24),
    [filteredData],
  );
  const monthlyArea = useMemo(() => {
    const map = new Map<string, { w: number; tot: number }>();
    for (const r of filteredData) {
      const cur = map.get(r.mes_ano) ?? { w: 0, tot: 0 };
      map.set(r.mes_ano, { w: cur.w + r.avg_area * r.total_rows, tot: cur.tot + r.total_rows });
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([, { w, tot }]) => ({ value: tot > 0 ? w / tot : 0 }));
  }, [filteredData]);
  const monthlyVolume = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredData) {
      map.set(r.mes_ano, (map.get(r.mes_ano) ?? 0) + r.total_rows);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([, v]) => ({ value: v }));
  }, [filteredData]);

  // Rental yield — cross-metric. Compute locally by pairing compra price
  // with arrendamento rent at the same geographic scope.
  const rentalYield = useMemo(() => {
    if (tipoVenda !== 'compra') return null;
    if (stats.empty) return null;
    const rentRecords = filterRecords(
      allData, 'arrendamento', drilldown.municipio, drilldown.freguesia,
    );
    const latestRent = latestMonth(rentRecords);
    if (!latestRent) return null;
    const rentRows = rentRecords.filter(r => r.mes_ano === latestRent);
    const rentM2 = wavg(rentRows, 'avg_m2');
    if (rentM2 <= 0 || stats.avgM2 <= 0) return null;
    return (rentM2 * 12) / stats.avgM2 * 100;
  }, [tipoVenda, allData, drilldown.municipio, drilldown.freguesia, stats]);

  // Rank of the selected muni (or null at district level / parish level).
  const muniRank = useMemo(() => {
    if (!drilldown.municipio || drilldown.freguesia) return null;
    const muniStats = getMunicipioStats(districtData);
    if (muniStats.length === 0) return null;
    const sorted = [...muniStats].sort((a, b) => b.avg_m2 - a.avg_m2);
    const idx = sorted.findIndex(s => s.name === drilldown.municipio);
    if (idx === -1) return null;
    return { position: idx + 1, total: sorted.length };
  }, [drilldown.municipio, drilldown.freguesia, districtData]);

  // ── Skeleton while drill data is in-flight
  if (stats.empty && isDrillLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm dark:bg-card/40"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 animate-pulse rounded bg-muted-foreground/15" />
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/50" />
            </div>
            <div className="mt-3 h-7 w-32 animate-pulse rounded bg-muted-foreground/15" />
            <div className="mt-2 h-9 animate-pulse rounded bg-muted-foreground/10" />
            <div className="mt-2.5 h-3 w-24 animate-pulse rounded bg-muted-foreground/10" />
          </div>
        ))}
      </div>
    );
  }

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
            the current view ({tipoVenda}). Try a different region or toggle market type.
          </div>
        </div>
      </div>
    );
  }

  const [y, m] = stats.latest!.split('-');
  const latestLabel = new Date(parseInt(y), parseInt(m) - 1)
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const prevYearLabel = String(parseInt(y) - 1);

  const cards: CardDef[] = [
    {
      title: metric === 'avg_m2'
        ? (tipoVenda === 'compra' ? 'Price / m²' : 'Rent / m² / mo')
        : (tipoVenda === 'compra' ? 'Avg Sale Price' : 'Avg Monthly Rent'),
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      value: metric === 'avg_m2'
        ? `€${Math.round(stats.avgM2).toLocaleString('pt-PT')}`
        : formatCurrency(stats.avgPreco, true),
      sub: `YoY vs ${prevYearLabel}`,
      change: metric === 'avg_m2' ? stats.changeM2 : stats.changePreco,
      accent: 'indigo',
      spark: monthlyM2,
      rank: muniRank,
    },
    {
      title: 'Total Listings',
      icon: <Home className="h-3.5 w-3.5" />,
      value: stats.totalRows.toLocaleString('pt-PT'),
      sub: `in ${latestLabel}`,
      change: stats.changeRows,
      accent: 'emerald',
      spark: monthlyVolume,
    },
    {
      title: 'Avg Area',
      icon: <Ruler className="h-3.5 w-3.5" />,
      value: `${Math.round(stats.avgArea)} m²`,
      sub: 'per listing',
      change: stats.changeArea,
      accent: 'amber',
      spark: monthlyArea,
    },
    {
      title: tipoVenda === 'compra' ? 'Rental Yield' : 'Market Type',
      icon: <Percent className="h-3.5 w-3.5" />,
      value: tipoVenda === 'compra'
        ? rentalYield !== null ? `${rentalYield.toFixed(1)}%` : '—'
        : 'Rental',
      sub: tipoVenda === 'compra' ? 'gross annual' : 'active scope',
      change: null,
      accent: 'fuchsia',
      spark: [],
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ title, icon, value, sub, change, accent, spark, rank }) => {
        const a = ACCENT[accent];
        return (
          <div
            key={title}
            className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-5 backdrop-blur-sm transition-all hover:border-border hover:-translate-y-px hover:shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.18)] dark:bg-card/40 dark:hover:bg-card/60"
          >
            {/* Top gradient line */}
            <div className={cn('absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent', a.from, a.via)} />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={cn('h-1.5 w-1.5 rounded-full', a.dot)} />
                <span className="text-[11px] font-medium text-muted-foreground tracking-wide">
                  {title}
                </span>
              </div>
              <span className="text-muted-foreground/50">{icon}</span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <div className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">
                {value}
              </div>
              {rank && (
                <span className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  #{rank.position}/{rank.total}
                </span>
              )}
            </div>

            {spark.length >= 2 && (
              <div className="mt-3 -mx-1">
                <Sparkline data={spark} color={a.line} height={36} />
              </div>
            )}

            <div className="mt-2 flex items-center gap-2 text-[11px]">
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
        );
      })}
    </div>
  );
}
