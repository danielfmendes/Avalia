import { useMemo, useState } from 'react';
import { Wallet, CheckCircle2, XCircle, Home, PiggyBank, Ruler } from 'lucide-react';
import { useDashboard } from '@/context/DashboardContext';
import { wavg } from '@/lib/dataUtils';
import { cn } from '@/lib/utils';
import type { HabitacaoRecord } from '@/lib/types';

interface MuniRow {
  municipio: string;
  avgPrice: number;
  avgArea: number;
  avgM2: number;
  volume: number;
}

interface ParishRow {
  freguesia: string;
  municipio: string;
  avgPrice: number;
  avgM2: number;
  avgArea: number;
  volume: number;
}

function municipalityRows(records: HabitacaoRecord[]): MuniRow[] {
  const scope = records.filter(
    r => r.tipo_venda === 'compra'
      && r.freguesia === 'Grouped at Municipio level'
      && r.mes_ano.startsWith('2023'),
  );
  const munis = [...new Set(scope.map(r => r.municipio))];
  return munis
    .map(name => {
      const rs = scope.filter(r => r.municipio === name);
      return {
        municipio: name,
        avgPrice: wavg(rs, 'avg_preco'),
        avgArea: wavg(rs, 'avg_area'),
        avgM2: wavg(rs, 'avg_m2'),
        volume: rs.reduce((s, r) => s + r.total_rows, 0),
      };
    })
    .filter(r => r.avgPrice > 0);
}

function parishRows(records: HabitacaoRecord[]): ParishRow[] {
  const scope = records.filter(
    r => r.tipo_venda === 'compra'
      && r.freguesia !== 'Grouped at Municipio level'
      && r.mes_ano.startsWith('2023'),
  );
  const keys = [...new Set(scope.map(r => `${r.municipio}|${r.freguesia}`))];
  return keys
    .map(k => {
      const [municipio, freguesia] = k.split('|');
      const rs = scope.filter(r => r.municipio === municipio && r.freguesia === freguesia);
      return {
        municipio,
        freguesia,
        avgPrice: wavg(rs, 'avg_preco'),
        avgM2: wavg(rs, 'avg_m2'),
        avgArea: wavg(rs, 'avg_area'),
        volume: rs.reduce((s, r) => s + r.total_rows, 0),
      };
    })
    .filter(r => r.avgPrice > 0);
}

function formatEuros(v: number): string {
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `€${Math.round(v / 1000)}K`;
  return `€${Math.round(v)}`;
}

export function Affordability() {
  const { districtData } = useDashboard();
  const [budget, setBudget] = useState<number>(350_000);
  const [scope, setScope] = useState<'municipios' | 'freguesias'>('municipios');

  const munis = useMemo(() => municipalityRows(districtData), [districtData]);
  const parishes = useMemo(() => parishRows(districtData), [districtData]);

  // Sort from "best fit" downwards:
  //  1. Affordable rows first — most expensive one that still fits the budget on top.
  //  2. Then over-budget rows — least over-budget first, most unreachable at the bottom.
  function sortByAffordability<T extends { avgPrice: number }>(
    rows: T[],
    budgetCents: number,
  ): Array<T & { gap: number; pctOfBudget: number }> {
    const enriched = rows.map(r => ({
      ...r,
      gap: budgetCents - r.avgPrice,
      pctOfBudget: r.avgPrice / budgetCents,
    }));
    const affordable = enriched
      .filter(r => r.avgPrice <= budgetCents)
      .sort((a, b) => b.avgPrice - a.avgPrice);
    const unaffordable = enriched
      .filter(r => r.avgPrice > budgetCents)
      .sort((a, b) => a.avgPrice - b.avgPrice);
    return [...affordable, ...unaffordable];
  }

  const muniEval = useMemo(
    () => sortByAffordability(munis, budget),
    [munis, budget],
  );

  const parishEval = useMemo(
    () => sortByAffordability(parishes, budget),
    [parishes, budget],
  );

  const affordableCount = scope === 'municipios'
    ? muniEval.filter(r => r.avgPrice <= budget).length
    : parishEval.filter(r => r.avgPrice <= budget).length;

  const totalCount = scope === 'municipios' ? muniEval.length : parishEval.length;

  // Budget-implied floor area, using the cheapest-per-m² municipality as a best case.
  const cheapestM2 = Math.min(...munis.map(r => r.avgM2));
  const bestCaseArea = cheapestM2 > 0 ? budget / cheapestM2 : 0;

  const presetAmounts = [150_000, 250_000, 350_000, 500_000, 750_000, 1_000_000];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
          <Wallet className="h-3 w-3 text-emerald-500" />
          Budget explorer
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Affordability</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter a budget and see where the average 2023 listing falls inside — or outside — your range.
        </p>
      </div>

      {/* Budget controls */}
      <div className="rounded-2xl border border-border/60 bg-card/80 p-5 backdrop-blur-sm dark:bg-card/40">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Your budget
            </label>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-3xl font-semibold tracking-tight">€</span>
              <input
                type="number"
                min={0}
                step={10_000}
                value={budget}
                onChange={e => setBudget(Math.max(0, Number(e.target.value)))}
                className="w-56 border-b border-border/60 bg-transparent text-3xl font-semibold tracking-tight tabular-nums outline-none focus:border-indigo-500"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {presetAmounts.map(v => (
                <button
                  key={v}
                  onClick={() => setBudget(v)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[11px] font-medium transition-colors',
                    budget === v
                      ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                      : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  {formatEuros(v)}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <input
                type="range"
                min={50_000}
                max={2_000_000}
                step={10_000}
                value={budget}
                onChange={e => setBudget(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>€50K</span>
                <span>€2M</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 md:gap-4">
            <div className="rounded-xl border border-border/60 bg-background/60 p-3">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Home className="h-3 w-3" />
                Affordable
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {affordableCount}/{totalCount}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {scope === 'municipios' ? 'municipalities' : 'parishes'}
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/60 p-3">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Ruler className="h-3 w-3" />
                Best-case area
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {Math.round(bestCaseArea)} m²
              </div>
              <div className="text-[10px] text-muted-foreground">at cheapest €/m²</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/60 p-3">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <PiggyBank className="h-3 w-3" />
                10% deposit
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {formatEuros(budget * 0.1)}
              </div>
              <div className="text-[10px] text-muted-foreground">typical down payment</div>
            </div>
          </div>
        </div>
      </div>

      {/* Scope toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">Show:</span>
        <div className="flex rounded-full border border-border/60 bg-muted/30 p-0.5">
          {([
            { k: 'municipios', label: 'Municipalities' },
            { k: 'freguesias', label: 'Parishes' },
          ] as const).map(opt => (
            <button
              key={opt.k}
              onClick={() => setScope(opt.k)}
              className={cn(
                'rounded-full px-4 py-1 text-[11px] font-semibold transition-colors',
                scope === opt.k
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/40'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {scope === 'municipios'
          ? muniEval.map(r => {
              const affordable = r.avgPrice <= budget;
              const barPct = Math.min(100, r.pctOfBudget * 100);
              return (
                <div
                  key={r.municipio}
                  className={cn(
                    'group relative overflow-hidden rounded-2xl border p-4 backdrop-blur-sm transition-all',
                    affordable
                      ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                      : 'border-border/60 bg-card/60 opacity-70 hover:opacity-100 dark:bg-card/30',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{r.municipio}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        €{Math.round(r.avgM2).toLocaleString('pt-PT')}/m² · {Math.round(r.avgArea)} m² avg
                      </div>
                    </div>
                    {affordable ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-rose-500/80" />
                    )}
                  </div>
                  <div className="mt-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-lg font-semibold tabular-nums">
                        {formatEuros(r.avgPrice)}
                      </span>
                      <span
                        className={cn(
                          'text-[11px] font-semibold tabular-nums',
                          affordable
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400',
                        )}
                      >
                        {affordable
                          ? `+${formatEuros(r.gap)} left`
                          : `-${formatEuros(-r.gap)} over`}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/60">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          affordable ? 'bg-emerald-500' : 'bg-rose-500',
                        )}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                      {(r.pctOfBudget * 100).toFixed(0)}% of budget
                    </div>
                  </div>
                </div>
              );
            })
          : parishEval.slice(0, 60).map(r => {
              const affordable = r.avgPrice <= budget;
              const barPct = Math.min(100, r.pctOfBudget * 100);
              return (
                <div
                  key={`${r.municipio}-${r.freguesia}`}
                  className={cn(
                    'group relative overflow-hidden rounded-2xl border p-4 backdrop-blur-sm transition-all',
                    affordable
                      ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                      : 'border-border/60 bg-card/60 opacity-70 hover:opacity-100 dark:bg-card/30',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{r.freguesia}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {r.municipio} · €{Math.round(r.avgM2).toLocaleString('pt-PT')}/m²
                      </div>
                    </div>
                    {affordable ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-rose-500/80" />
                    )}
                  </div>
                  <div className="mt-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-lg font-semibold tabular-nums">
                        {formatEuros(r.avgPrice)}
                      </span>
                      <span
                        className={cn(
                          'text-[11px] font-semibold tabular-nums',
                          affordable
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400',
                        )}
                      >
                        {affordable
                          ? `+${formatEuros(r.gap)}`
                          : `-${formatEuros(-r.gap)}`}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/60">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          affordable ? 'bg-emerald-500' : 'bg-rose-500',
                        )}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
      </div>

      {scope === 'freguesias' && parishEval.length > 60 && (
        <p className="text-[10px] text-muted-foreground text-center">
          Showing the 60 best-matching parishes ({parishEval.length} total).
        </p>
      )}
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        * Affordability compares your budget to the 2023 weighted average sale price per region. Real listings
        vary widely above and below this average. Excludes taxes, fees, and financing costs.
      </p>
    </div>
  );
}
