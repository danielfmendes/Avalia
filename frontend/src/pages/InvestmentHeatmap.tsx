import { useMemo, useState } from 'react';
import { getMunicipioStats } from '@/lib/dataUtils';
import { useDashboard } from '@/context/DashboardContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MunicipioStat } from '@/lib/types';

type SortKey = 'avg_m2' | 'yoy_change' | 'rental_yield' | 'total_rows';

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'avg_m2', label: 'Price/m²' },
  { key: 'yoy_change', label: 'YoY Change' },
  { key: 'rental_yield', label: 'Rental Yield' },
  { key: 'total_rows', label: 'Volume' },
];

function getHeatColor(stat: MunicipioStat, sortKey: SortKey, min: number, max: number): string {
  const value = stat[sortKey];
  const t = max > min ? (value - min) / (max - min) : 0.5;

  if (sortKey === 'yoy_change' || sortKey === 'rental_yield') {
    // Green for high
    const r = Math.round(220 - t * 160);
    const g = Math.round(100 + t * 155);
    const b = Math.round(100 - t * 40);
    return `rgba(${r},${g},${b},0.18)`;
  }

  if (sortKey === 'avg_m2') {
    // Blue-purple for expensive
    const r = Math.round(100 + t * 100);
    const g = Math.round(100 - t * 60);
    const b = Math.round(200 + t * 55);
    return `rgba(${r},${g},${b},0.18)`;
  }

  // Volume: teal
  const r = Math.round(20);
  const g = Math.round(120 + t * 80);
  const b = Math.round(150 + t * 55);
  return `rgba(${r},${g},${b},0.18)`;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function computeInvestmentScore(stat: MunicipioStat, all: MunicipioStat[]): number {
  const maxYoy = Math.max(...all.map(s => s.yoy_change));
  const maxYield = Math.max(...all.map(s => s.rental_yield));
  const maxM2 = Math.max(...all.map(s => s.avg_m2));

  const yoyScore = Math.max(0, stat.yoy_change / maxYoy) * 40;
  const yieldScore = (stat.rental_yield / maxYield) * 40;
  const affordScore = (1 - stat.avg_m2 / maxM2) * 20;

  return Math.min(100, Math.round(yoyScore + yieldScore + affordScore));
}

export function InvestmentHeatmap() {
  const [sortKey, setSortKey] = useState<SortKey>('avg_m2');
  const { allData } = useDashboard();
  const stats = useMemo(() => getMunicipioStats(allData), [allData]);

  const sorted = useMemo(
    () => [...stats].sort((a, b) => b[sortKey] - a[sortKey]),
    [stats, sortKey],
  );

  const minVal = Math.min(...sorted.map(s => s[sortKey]));
  const maxVal = Math.max(...sorted.map(s => s[sortKey]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Investment Heatmap</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            District-by-district price intensity and yield analysis
          </p>
        </div>
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">Color by:</span>
        <div className="flex rounded-lg border p-1 gap-1">
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                sortKey === key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((stat, idx) => {
          const bgColor = getHeatColor(stat, sortKey, minVal, maxVal);
          const score = computeInvestmentScore(stat, stats);
          const rank = idx + 1;

          return (
            <Card
              key={stat.name}
              className="relative overflow-hidden transition-shadow hover:shadow-md"
              style={{ backgroundColor: bgColor }}
            >
              <div className="absolute right-3 top-3">
                <span className="text-2xl font-black text-foreground/8">#{rank}</span>
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <span className="text-sm">{stat.name}</span>
                  <span className={cn('text-sm font-bold', getScoreColor(score))}>
                    {score}/100
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Main price metric */}
                <div>
                  <div className="text-xl font-bold tracking-tight">
                    €{Math.round(stat.avg_m2).toLocaleString('pt-PT')}/m²
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Avg sale price:{' '}
                    {stat.avg_preco >= 1_000_000
                      ? `€${(stat.avg_preco / 1_000_000).toFixed(2)}M`
                      : `€${Math.round(stat.avg_preco / 1000)}K`}
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-background/40 p-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      YoY
                    </div>
                    <div
                      className={cn(
                        'text-xs font-semibold flex items-center gap-0.5',
                        stat.yoy_change >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400',
                      )}
                    >
                      {stat.yoy_change >= 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {Math.abs(stat.yoy_change).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Yield
                    </div>
                    <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                      {stat.rental_yield.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Area
                    </div>
                    <div className="text-xs font-semibold">
                      {Math.round(stat.avg_area)}m²
                    </div>
                  </div>
                </div>

                {/* Investment score bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="h-2.5 w-2.5" /> Investment Score
                    </span>
                    <Badge
                      variant={score >= 70 ? 'default' : 'outline'}
                      className="text-[10px] h-4 px-1.5"
                    >
                      {score >= 80 ? 'Strong Buy' : score >= 60 ? 'Moderate' : 'Caution'}
                    </Badge>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        score >= 80
                          ? 'bg-emerald-500'
                          : score >= 60
                            ? 'bg-amber-500'
                            : 'bg-rose-500',
                      )}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary insight */}
      <Card className="border-dashed">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2 shrink-0">
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <div className="text-sm font-semibold">Market Summary — 2023</div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Lisboa leads in price at{' '}
                <strong>€{Math.round(stats.find(s => s.name === 'Lisboa')?.avg_m2 ?? 0).toLocaleString('pt-PT')}/m²</strong>,
                while{' '}
                <strong>{[...stats].sort((a, b) => b.rental_yield - a.rental_yield)[0]?.name}</strong>{' '}
                offers the highest rental yield at{' '}
                <strong>{[...stats].sort((a, b) => b.rental_yield - a.rental_yield)[0]?.rental_yield.toFixed(1)}%</strong>.
                {' '}The highest YoY appreciation goes to{' '}
                <strong>{[...stats].sort((a, b) => b.yoy_change - a.yoy_change)[0]?.name}</strong> at{' '}
                <strong>+{[...stats].sort((a, b) => b.yoy_change - a.yoy_change)[0]?.yoy_change.toFixed(1)}%</strong>.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
