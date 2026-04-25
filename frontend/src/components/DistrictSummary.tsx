import { useMemo } from 'react';
import { Crown, TrendingUp, Banknote, BarChart3 } from 'lucide-react';
import { useDashboard } from '@/context/DashboardContext';
import { getMunicipioStats } from '@/lib/dataUtils';

// Top-of-page strip: quick district-level facts that frame the rest of the
// dashboard. Always sourced from districtData so it renders on cold start
// without waiting for any drill fetches.
export function DistrictSummary() {
  const { districtData } = useDashboard();

  const { topPrice, topGrowth, topYield, totalListings } = useMemo(() => {
    const stats = getMunicipioStats(districtData);
    if (stats.length === 0) {
      return { topPrice: null, topGrowth: null, topYield: null, totalListings: 0 };
    }
    // Pick the maximum in a single pass and skip ranks with no real signal —
    // otherwise an alphabetically-first muni shows up as "fastest growing" with
    // 0% when YoY data isn't available yet.
    const pickMax = <T extends Record<K, number>, K extends string>(
      arr: T[], key: K,
    ): T | null => {
      let best: T | null = null;
      for (const r of arr) {
        if (r[key] === 0 && (best === null || best[key] === 0)) continue;
        if (best === null || r[key] > best[key]) best = r;
      }
      return best;
    };
    const volume = stats.reduce((s, m) => s + m.total_rows, 0);
    return {
      topPrice: pickMax(stats, 'avg_m2'),
      topGrowth: pickMax(stats, 'yoy_change'),
      topYield: pickMax(stats, 'rental_yield'),
      totalListings: volume,
    };
  }, [districtData]);

  if (!topPrice) return null;

  const items = [
    {
      icon: <Crown className="h-3.5 w-3.5 text-amber-500" />,
      label: 'Most expensive',
      primary: topPrice.name,
      secondary: `€${Math.round(topPrice.avg_m2).toLocaleString('pt-PT')}/m²`,
    },
    {
      icon: <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />,
      label: 'Fastest growing',
      primary: topGrowth?.name ?? '—',
      secondary: topGrowth
        ? `${topGrowth.yoy_change >= 0 ? '+' : ''}${topGrowth.yoy_change.toFixed(1)}% YoY`
        : 'no YoY data',
    },
    {
      icon: <Banknote className="h-3.5 w-3.5 text-fuchsia-500" />,
      label: 'Best rental yield',
      primary: topYield?.name ?? '—',
      secondary: topYield ? `${topYield.rental_yield.toFixed(1)}% gross` : 'no rental data',
    },
    {
      icon: <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />,
      label: 'District listings',
      primary: totalListings.toLocaleString('pt-PT'),
      secondary: '2023 listings',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm md:grid-cols-4 dark:bg-card/30">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={i < items.length - 1 ? 'md:border-r md:border-border/50 md:pr-4' : ''}
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {item.icon}
            {item.label}
          </div>
          <div className="mt-1.5 text-sm font-semibold tracking-tight">{item.primary}</div>
          <div className="text-[11px] text-muted-foreground tabular-nums">{item.secondary}</div>
        </div>
      ))}
    </div>
  );
}
