import { useMemo, useState } from 'react';
import { Scale, ArrowDownAZ, Clock, Percent, Banknote } from 'lucide-react';
import { useDashboard } from '@/context/DashboardContext';
import { wavg } from '@/lib/dataUtils';
import { cn } from '@/lib/utils';
import type { HabitacaoRecord } from '@/lib/types';

type SortKey = 'yield' | 'payback' | 'buyM2' | 'rentM2' | 'municipio';

interface Row {
  municipio: string;
  buyM2: number;
  rentM2: number;   // monthly €/m²
  buyAvgPrice: number;
  avgArea: number;
  yield: number;    // gross annual %
  payback: number;  // years
}

function buildRows(records: HabitacaoRecord[]): Row[] {
  // Use the latest 2023 data for both markets.
  const scope = records.filter(
    r => r.freguesia === 'Grouped at Municipio level'
      && r.mes_ano.startsWith('2023'),
  );
  const munis = [...new Set(scope.map(r => r.municipio))];

  return munis
    .map(name => {
      const buy = scope.filter(r => r.municipio === name && r.tipo_venda === 'compra');
      const rent = scope.filter(r => r.municipio === name && r.tipo_venda === 'arrendamento');

      const buyM2 = wavg(buy, 'avg_m2');
      const rentM2 = wavg(rent, 'avg_m2');
      const buyAvgPrice = wavg(buy, 'avg_preco');
      const avgArea = wavg(buy, 'avg_area');

      const annualRent = rentM2 * 12;
      const yieldPct = buyM2 > 0 ? (annualRent / buyM2) * 100 : 0;
      const paybackYrs = annualRent > 0 ? buyM2 / annualRent : 0;

      return {
        municipio: name,
        buyM2,
        rentM2,
        buyAvgPrice,
        avgArea,
        yield: yieldPct,
        payback: paybackYrs,
      };
    })
    .filter(r => r.buyM2 > 0 && r.rentM2 > 0);
}

function YieldBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = value >= 5 ? '#10b981' : value >= 4 ? '#f59e0b' : '#94a3b8';
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color }}>
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

function PaybackPill({ value }: { value: number }) {
  // Lower payback = better for investor. Color bands.
  const tone =
    value <= 18 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : value <= 24 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400';
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', tone)}>
      {value.toFixed(1)} yrs
    </span>
  );
}

export function RentVsBuy() {
  const { districtData } = useDashboard();
  const [sortKey, setSortKey] = useState<SortKey>('yield');

  const rows = useMemo(() => buildRows(districtData), [districtData]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    switch (sortKey) {
      case 'yield':     copy.sort((a, b) => b.yield - a.yield); break;
      case 'payback':   copy.sort((a, b) => a.payback - b.payback); break;
      case 'buyM2':     copy.sort((a, b) => b.buyM2 - a.buyM2); break;
      case 'rentM2':    copy.sort((a, b) => b.rentM2 - a.rentM2); break;
      case 'municipio': copy.sort((a, b) => a.municipio.localeCompare(b.municipio)); break;
    }
    return copy;
  }, [rows, sortKey]);

  const maxYield = useMemo(() => Math.max(...rows.map(r => r.yield), 0.001), [rows]);

  // District-level summary for the hero strip.
  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    const best = [...rows].sort((a, b) => b.yield - a.yield)[0];
    const worst = [...rows].sort((a, b) => a.yield - b.yield)[0];
    const avgYield = rows.reduce((s, r) => s + r.yield, 0) / rows.length;
    const avgPayback = rows.reduce((s, r) => s + r.payback, 0) / rows.length;
    return { best, worst, avgYield, avgPayback };
  }, [rows]);

  const fmtM2 = (v: number) => `€${Math.round(v).toLocaleString('pt-PT')}`;
  const fmtPrice = (v: number) => v >= 1_000_000
    ? `€${(v / 1_000_000).toFixed(2)}M`
    : `€${Math.round(v / 1000)}K`;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
          <Scale className="h-3 w-3 text-indigo-500" />
          Yield & payback
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Rent vs Buy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gross rental yield and cash payback by municipality, using 2023 sale and rent averages.
        </p>
      </div>

      {/* Summary strip */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm md:grid-cols-4 dark:bg-card/30">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Percent className="h-3 w-3 text-emerald-500" />
              Best yield
            </div>
            <div className="mt-1 text-sm font-semibold">{summary.best.municipio}</div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {summary.best.yield.toFixed(1)}% gross
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3 w-3 text-indigo-500" />
              Fastest payback
            </div>
            <div className="mt-1 text-sm font-semibold">
              {[...rows].sort((a, b) => a.payback - b.payback)[0]?.municipio ?? '—'}
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {[...rows].sort((a, b) => a.payback - b.payback)[0]?.payback.toFixed(1) ?? '—'} years
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <ArrowDownAZ className="h-3 w-3 text-rose-500" />
              Weakest yield
            </div>
            <div className="mt-1 text-sm font-semibold">{summary.worst.municipio}</div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {summary.worst.yield.toFixed(1)}% gross
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Banknote className="h-3 w-3 text-amber-500" />
              District average
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums">
              {summary.avgYield.toFixed(2)}%
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {summary.avgPayback.toFixed(1)} yr payback
            </div>
          </div>
        </div>
      )}

      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">Sort:</span>
        <div className="flex flex-wrap gap-1 rounded-full border border-border/60 bg-muted/30 p-0.5">
          {([
            { k: 'yield',     label: 'Yield' },
            { k: 'payback',   label: 'Payback' },
            { k: 'buyM2',     label: 'Buy €/m²' },
            { k: 'rentM2',    label: 'Rent €/m²' },
            { k: 'municipio', label: 'Name' },
          ] as const).map(opt => (
            <button
              key={opt.k}
              onClick={() => setSortKey(opt.k)}
              className={cn(
                'rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
                sortKey === opt.k
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/40'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm dark:bg-card/40">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left font-semibold">Municipality</th>
                <th className="px-4 py-3 text-right font-semibold">Buy €/m²</th>
                <th className="px-4 py-3 text-right font-semibold">Rent €/m²/mo</th>
                <th className="px-4 py-3 text-right font-semibold">Avg price</th>
                <th className="px-4 py-3 text-right font-semibold">Avg area</th>
                <th className="px-4 py-3 text-right font-semibold">Gross yield</th>
                <th className="px-4 py-3 text-right font-semibold">Payback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {sorted.map(r => (
                <tr key={r.municipio} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium">{r.municipio}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtM2(r.buyM2)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">€{r.rentM2.toFixed(1)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {fmtPrice(r.buyAvgPrice)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {Math.round(r.avgArea)} m²
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end">
                      <YieldBar value={r.yield} max={maxYield} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <PaybackPill value={r.payback} />
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No paired buy/rent data for this district.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        * Gross annual yield = rent/m²/mo × 12 ÷ buy/m². Payback = buy/m² ÷ (rent/m² × 12). Excludes taxes,
        vacancy, maintenance, and transaction costs.
      </p>
    </div>
  );
}
