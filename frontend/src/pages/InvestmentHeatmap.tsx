import { useMemo, useState } from 'react';
import { getMunicipioStats } from '@/lib/dataUtils';
import { useDashboard } from '@/context/DashboardContext';
import { ArrowUpRight, ArrowDownRight, TrendingUp, Trophy } from 'lucide-react';
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
    const r = Math.round(220 - t * 160);
    const g = Math.round(100 + t * 155);
    const b = Math.round(100 - t * 40);
    return `rgba(${r},${g},${b},0.18)`;
  }
  if (sortKey === 'avg_m2') {
    const r = Math.round(100 + t * 100);
    const g = Math.round(100 - t * 60);
    const b = Math.round(200 + t * 55);
    return `rgba(${r},${g},${b},0.18)`;
  }
  const g = Math.round(120 + t * 80);
  const b = Math.round(150 + t * 55);
  return `rgba(20,${g},${b},0.18)`;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function computeInvestmentScore(stat: MunicipioStat, all: MunicipioStat[]): number {
  const maxYoy = Math.max(...all.map(s => Math.max(0, s.yoy_change)), 0.001);
  const maxYield = Math.max(...all.map(s => s.rental_yield), 0.001);
  const maxM2 = Math.max(...all.map(s => s.avg_m2), 0.001);

  const yoyScore = Math.max(0, stat.yoy_change / maxYoy) * 40;
  const yieldScore = (stat.rental_yield / maxYield) * 40;
  const affordScore = (1 - stat.avg_m2 / maxM2) * 20;

  return Math.min(100, Math.round(yoyScore + yieldScore + affordScore));
}

export function InvestmentHeatmap() {
  const [sortKey, setSortKey] = useState<SortKey>('avg_m2');
  const { districtData } = useDashboard();
  const stats = useMemo(() => getMunicipioStats(districtData), [districtData]);

  const sorted = useMemo(
    () => [...stats].sort((a, b) => b[sortKey] - a[sortKey]),
    [stats, sortKey],
  );

  const minVal = stats.length > 0 ? Math.min(...stats.map(s => s[sortKey])) : 0;
  const maxVal = stats.length > 0 ? Math.max(...stats.map(s => s[sortKey])) : 1;

  const { podium, bottom } = useMemo(() => {
    const ranked = [...stats].map(s => ({
      ...s,
      score: computeInvestmentScore(s, stats),
    })).sort((a, b) => b.score - a.score);
    return { podium: ranked.slice(0, 3), bottom: ranked.slice(-3).reverse() };
  }, [stats]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
          District Ranking
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Investment Heatmap</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          District-by-district price intensity, growth velocity, and yield analysis.
        </p>
      </div>

      {/* Podium + bottom three */}
      {stats.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm dark:bg-card/30">
            <div className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              <Trophy className="h-3 w-3 text-amber-500" />
              Top investment score
            </div>
            <div className="space-y-2">
              {podium.map((s, i) => (
                <div key={s.name} className="flex items-center gap-3">
                  <div className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    i === 0 ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      : i === 1 ? 'bg-slate-400/20 text-slate-600 dark:text-slate-300'
                        : 'bg-orange-600/20 text-orange-700 dark:text-orange-500',
                  )}>
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      €{Math.round(s.avg_m2).toLocaleString('pt-PT')}/m² · {s.rental_yield.toFixed(1)}% yield
                    </div>
                  </div>
                  <div className={cn('text-sm font-bold tabular-nums', getScoreColor(s.score))}>
                    {s.score}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm dark:bg-card/30">
            <div className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              Lowest score
            </div>
            <div className="space-y-2">
              {bottom.map((s) => (
                <div key={s.name} className="flex items-center gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted/60 text-[10px] font-bold text-muted-foreground">
                    —
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      €{Math.round(s.avg_m2).toLocaleString('pt-PT')}/m² · {s.rental_yield.toFixed(1)}% yield
                    </div>
                  </div>
                  <div className={cn('text-sm font-bold tabular-nums', getScoreColor(s.score))}>
                    {s.score}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">Color by:</span>
        <div className="flex rounded-full border border-border/60 bg-muted/30 p-0.5">
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={cn(
                'rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
                sortKey === key
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/40'
                  : 'text-muted-foreground hover:text-foreground',
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
            <div
              key={stat.name}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm transition-all hover:border-border hover:-translate-y-px hover:shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.18)] dark:bg-card/40 dark:hover:bg-card/60"
              style={{ backgroundColor: bgColor }}
            >
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">#{rank}</div>
                    <div className="text-base font-semibold tracking-tight">{stat.name}</div>
                  </div>
                  <span className={cn('text-sm font-bold tabular-nums', getScoreColor(score))}>
                    {score}
                  </span>
                </div>

                <div className="mt-3">
                  <div className="text-[22px] font-semibold tracking-tight tabular-nums">
                    €{Math.round(stat.avg_m2).toLocaleString('pt-PT')}<span className="text-sm text-muted-foreground font-normal">/m²</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Avg sale{' '}
                    {stat.avg_preco >= 1_000_000
                      ? `€${(stat.avg_preco / 1_000_000).toFixed(2)}M`
                      : `€${Math.round(stat.avg_preco / 1000)}K`}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-background/40 p-2 dark:bg-background/20">
                  <div>
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground">YoY</div>
                    <div
                      className={cn(
                        'text-xs font-semibold flex items-center gap-0.5 tabular-nums',
                        stat.yoy_change >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400',
                      )}
                    >
                      {stat.yoy_change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {Math.abs(stat.yoy_change).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Yield</div>
                    <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                      {stat.rental_yield.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Area</div>
                    <div className="text-xs font-semibold tabular-nums">
                      {Math.round(stat.avg_area)}m²
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="h-2.5 w-2.5" /> Score
                    </span>
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {score >= 80 ? 'Strong Buy' : score >= 60 ? 'Moderate' : 'Caution'}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        score >= 80 ? 'bg-emerald-500'
                          : score >= 60 ? 'bg-amber-500'
                            : 'bg-rose-500',
                      )}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
