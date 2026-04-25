import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  GitCompareArrows, Plus, X, Crown, ArrowUpRight, ArrowDownRight, Search, Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useDashboard } from '@/context/DashboardContext';
import { getMunicipioStats, getParishStats } from '@/lib/dataUtils';
import { useAvaliaData } from '@/hooks/useAvaliaData';
import { cn } from '@/lib/utils';
import type { MunicipioStat, HabitacaoRecord } from '@/lib/types';

type CompareScope = 'munis' | 'parishes';

const MAX_SELECTED = 6;

// Six distinct hues that stay legible on both themes.
const SERIES_COLORS = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#d946ef', // fuchsia
  '#06b6d4', // cyan
  '#ef4444', // red
];

function useIsDark() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark')),
    );
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

function pricePerM2Series(
  records: HabitacaoRecord[],
  region: string,
  tipoVenda: 'compra' | 'arrendamento',
  scope: CompareScope,
): Array<{ mes_ano: string; value: number }> {
  const scoped = records.filter(r => {
    if (r.tipo_venda !== tipoVenda) return false;
    if (scope === 'munis') {
      return r.municipio === region && r.freguesia === 'Grouped at Municipio level';
    }
    // parishes view: region is a freguesia within Lisboa
    return r.municipio === 'Lisboa' && r.freguesia === region;
  });
  const map = new Map<string, { w: number; tot: number }>();
  for (const r of scoped) {
    const cur = map.get(r.mes_ano) ?? { w: 0, tot: 0 };
    map.set(r.mes_ano, { w: cur.w + r.avg_m2 * r.total_rows, tot: cur.tot + r.total_rows });
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes_ano, { w, tot }]) => ({ mes_ano, value: tot > 0 ? w / tot : 0 }));
}

// ── Add-municipality popover ────────────────────────────────────────────────
// Rendered via portal so `backdrop-filter` on ancestor containers (which creates
// a new stacking context) can't clip it behind the municipality cards below.
function AddPopover({
  available, onAdd, disabled, label,
}: {
  available: string[];
  onAdd: (name: string) => void;
  disabled: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Keep the popover anchored to the button as the layout moves.
  useLayoutEffect(() => {
    if (!open) return;
    function update() {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left });
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  // Close on outside click + ESC.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...available].sort((a, b) => a.localeCompare(b));
    return q ? base.filter(n => n.toLowerCase().includes(q)) : base;
  }, [available, query]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-xs font-medium transition-colors',
          disabled
            ? 'border-border/40 text-muted-foreground/50 cursor-not-allowed'
            : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-border',
        )}
      >
        <Plus className="h-3 w-3" />
        {label}
      </button>
      {open && !disabled && pos && createPortal(
        <div
          ref={popRef}
          className="fixed z-[100] w-64 rounded-lg border border-border bg-popover p-1.5 shadow-xl"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-background px-2 py-1">
            <Search className="h-3 w-3 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          <div className="mt-1 max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">No match.</div>
            ) : (
              filtered.map(name => (
                <button
                  key={name}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    onAdd(name);
                    setOpen(false);
                    setQuery('');
                  }}
                  className="flex w-full items-center rounded-md px-3 py-1.5 text-left text-xs hover:bg-muted"
                >
                  {name}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function fmtM2(v: number) {
  return `€${Math.round(v).toLocaleString('pt-PT')}`;
}
function fmtPrice(v: number) {
  return v >= 1_000_000
    ? `€${(v / 1_000_000).toFixed(2)}M`
    : `€${Math.round(v / 1000)}K`;
}

// ── Per-municipality summary card ───────────────────────────────────────────
function MuniCard({
  stat, color, onRemove,
}: {
  stat: MunicipioStat;
  color: string;
  onRemove: () => void;
}) {
  const up = stat.yoy_change >= 0;
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-4 backdrop-blur-sm transition-all hover:border-border dark:bg-card/40"
    >
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: color }}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate text-sm font-semibold tracking-tight">{stat.name}</span>
        </div>
        <button
          onClick={onRemove}
          className="rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
          aria-label={`Remove ${stat.name}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-3">
        <div className="text-[22px] font-semibold tracking-tight tabular-nums">
          {fmtM2(stat.avg_m2)}
          <span className="ml-0.5 text-xs font-normal text-muted-foreground">/m²</span>
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          avg sale {fmtPrice(stat.avg_preco)} · {Math.round(stat.avg_area)} m²
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
            up
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
          )}
        >
          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(stat.yoy_change).toFixed(1)}%
        </span>
        <span className="text-[10px] text-muted-foreground">YoY</span>
        <span className="ml-auto rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground tabular-nums">
          {stat.rental_yield.toFixed(1)}% yield
        </span>
      </div>
    </div>
  );
}

// ── Metric comparison matrix ────────────────────────────────────────────────
type MetricKey = 'avg_m2' | 'avg_preco' | 'yoy_change' | 'rental_yield' | 'avg_area' | 'total_rows';

interface MetricDef {
  key: MetricKey;
  label: string;
  sub: string;
  higherIsBetter: boolean;
  format: (v: number) => string;
}

const METRICS: MetricDef[] = [
  { key: 'avg_m2',       label: 'Price / m²',        sub: '2023 weighted avg',      higherIsBetter: false, format: fmtM2 },
  { key: 'avg_preco',    label: 'Avg sale price',    sub: '2023 weighted avg',      higherIsBetter: false, format: fmtPrice },
  { key: 'yoy_change',   label: 'YoY change',        sub: '€/m² 2022 → 2023',        higherIsBetter: true,  format: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` },
  { key: 'rental_yield', label: 'Rental yield',      sub: 'gross annual',           higherIsBetter: true,  format: v => `${v.toFixed(1)}%` },
  { key: 'avg_area',     label: 'Avg area',          sub: 'm² per listing',         higherIsBetter: true,  format: v => `${Math.round(v)} m²` },
  { key: 'total_rows',   label: 'Listings volume',   sub: '2023 total',             higherIsBetter: true,  format: v => v.toLocaleString('pt-PT') },
];

// Each data cell: the formatted value + a horizontal bar showing how this
// municipality ranks inside the row. Winner gets a crown, emerald text, and
// a subtle tinted background.
function MatrixCell({
  value, rowMin, rowMax, higherIsBetter, isBest, color, format,
}: {
  value: number;
  rowMin: number;
  rowMax: number;
  higherIsBetter: boolean;
  isBest: boolean;
  color: string;
  format: (v: number) => string;
}) {
  const range = rowMax - rowMin;
  // Normalize to 0..1 along "goodness". For lower-is-better, invert.
  let norm = range > 0 ? (value - rowMin) / range : 0.5;
  if (!higherIsBetter) norm = 1 - norm;
  const barPct = Math.max(8, norm * 100);

  return (
    <div
      className={cn(
        'group/cell relative rounded-md px-3 py-2 transition-colors',
        isBest && 'bg-emerald-500/[0.06]',
      )}
    >
      <div className="flex items-center justify-end gap-1">
        {isBest && <Crown className="h-3 w-3 text-amber-500" />}
        <span
          className={cn(
            'text-sm font-semibold tabular-nums',
            isBest
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-foreground',
          )}
        >
          {format(value)}
        </span>
      </div>
      <div className="mt-1.5 h-1 w-full rounded-full bg-muted/50 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${barPct}%`,
            backgroundColor: color,
            opacity: isBest ? 1 : 0.55,
          }}
        />
      </div>
    </div>
  );
}

export function Compare() {
  const { districtData, tipoVenda } = useDashboard();
  const isDark = useIsDark();

  const [scope, setScope] = useState<CompareScope>('munis');

  // Fetch Lisboa's parish rows only when the parish view is active. Cached by
  // useAvaliaData so toggling back and forth is instant.
  const lisboaScope = scope === 'parishes'
    ? { level: 'municipality' as const, municipio: 'Lisboa' }
    : null;
  const lisboaQ = useAvaliaData(lisboaScope);

  const muniStats = useMemo<MunicipioStat[]>(
    () => getMunicipioStats(districtData),
    [districtData],
  );
  const parishStatsForLisboa = useMemo<MunicipioStat[]>(
    () => (scope === 'parishes' ? getParishStats(lisboaQ.data, 'Lisboa') : []),
    [scope, lisboaQ.data],
  );

  const regionStats = scope === 'munis' ? muniStats : parishStatsForLisboa;
  const regionRecords = scope === 'munis' ? districtData : lisboaQ.data;
  const allNames = useMemo(() => regionStats.map(s => s.name), [regionStats]);

  const [selected, setSelected] = useState<string[]>([]);

  // Reset the selection whenever scope changes — the set of valid names differs.
  useEffect(() => {
    setSelected([]);
  }, [scope]);

  // Seed with the three most expensive once data arrives (per scope).
  useEffect(() => {
    if (selected.length === 0 && regionStats.length > 0) {
      const top = [...regionStats].sort((a, b) => b.avg_m2 - a.avg_m2).slice(0, 3).map(s => s.name);
      setSelected(top);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionStats]);

  const selectedStats = useMemo(
    () => selected
      .map(name => regionStats.find(s => s.name === name))
      .filter(Boolean) as MunicipioStat[],
    [selected, regionStats],
  );
  const colorOf = (i: number) => SERIES_COLORS[i % SERIES_COLORS.length];

  const trendSeries = useMemo(
    () => selected.map(name => pricePerM2Series(regionRecords, name, tipoVenda, scope)),
    [selected, regionRecords, tipoVenda, scope],
  );

  const combinedChart = useMemo(() => {
    const monthSet = new Set<string>();
    trendSeries.forEach(s => s.forEach(p => monthSet.add(p.mes_ano)));
    const months = [...monthSet].sort();
    return months.map(mes_ano => {
      const row: Record<string, string | number> = { mes_ano };
      selected.forEach((name, i) => {
        const pt = trendSeries[i].find(p => p.mes_ano === mes_ano);
        if (pt) row[name] = Math.round(pt.value);
      });
      return row;
    });
  }, [trendSeries, selected]);

  // For each metric, which muni wins?
  const winners = useMemo(() => {
    const w: Record<MetricKey, string | null> = {
      avg_m2: null, avg_preco: null, yoy_change: null,
      rental_yield: null, avg_area: null, total_rows: null,
    };
    if (selectedStats.length === 0) return w;
    for (const m of METRICS) {
      let best = selectedStats[0];
      for (const s of selectedStats) {
        if (m.higherIsBetter ? s[m.key] > best[m.key] : s[m.key] < best[m.key]) {
          best = s;
        }
      }
      w[m.key] = best.name;
    }
    return w;
  }, [selectedStats]);

  const available = useMemo(
    () => allNames.filter(n => !selected.includes(n)),
    [allNames, selected],
  );

  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
            <GitCompareArrows className="h-3 w-3 text-indigo-500" />
            Side by side
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Compare</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick up to {MAX_SELECTED} {scope === 'munis' ? 'municipalities' : 'Lisbon city parishes'} and see exactly how they stack up.
          </p>
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {selected.length} / {MAX_SELECTED} selected
        </div>
      </div>

      {/* Scope toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">Compare:</span>
        <div className="flex rounded-full border border-border/60 bg-muted/30 p-0.5">
          {([
            { k: 'munis', label: 'Lisboa municipalities' },
            { k: 'parishes', label: 'Lisbon city parishes' },
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
        {scope === 'parishes' && lisboaQ.isLoading && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading Lisbon city data…
          </span>
        )}
      </div>

      {/* Selection bar */}
      <div className="rounded-2xl border border-border/60 bg-card/80 p-4 backdrop-blur-sm dark:bg-card/40">
        <div className="flex flex-wrap items-center gap-2">
          {selected.map((name, i) => (
            <span
              key={name}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 py-1 pl-2 pr-1 text-xs font-medium"
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colorOf(i) }} />
              {name}
              <button
                onClick={() => setSelected(s => s.filter(n => n !== name))}
                className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <AddPopover
            available={available}
            onAdd={name => setSelected(s => (s.length < MAX_SELECTED ? [...s, name] : s))}
            disabled={selected.length >= MAX_SELECTED}
            label={scope === 'munis' ? 'Add municipality' : 'Add parish'}
          />
          {selected.length > 0 && (
            <button
              onClick={() => setSelected([])}
              className="ml-auto rounded-full px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {selectedStats.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-8 text-center text-sm text-muted-foreground">
          Select at least one {scope === 'munis' ? 'municipality' : 'parish'} to start comparing.
        </div>
      ) : (
        <>
          {/* Per-municipality cards */}
          <div className={cn(
            'grid gap-3',
            selectedStats.length === 1 && 'grid-cols-1',
            selectedStats.length === 2 && 'grid-cols-1 sm:grid-cols-2',
            selectedStats.length === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
            selectedStats.length >= 4 && 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
            selectedStats.length >= 5 && 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6',
          )}>
            {selectedStats.map((s, i) => (
              <MuniCard
                key={s.name}
                stat={s}
                color={colorOf(i)}
                onRemove={() => setSelected(prev => prev.filter(n => n !== s.name))}
              />
            ))}
          </div>

          {/* Comparison matrix */}
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm dark:bg-card/40">
            <div className="border-b border-border/50 px-5 py-3">
              <div className="text-sm font-semibold">Metric comparison</div>
              <div className="text-[11px] text-muted-foreground">
                Each bar shows how that municipality ranks in the row. Crown marks the winner.
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs table-fixed">
                <colgroup>
                  <col style={{ width: '180px' }} />
                  {selectedStats.map(s => (
                    <col key={s.name} style={{ minWidth: '140px' }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      Metric
                    </th>
                    {selectedStats.map((s, i) => (
                      <th
                        key={s.name}
                        className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-muted-foreground"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colorOf(i) }} />
                          <span className="truncate">{s.name}</span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {METRICS.map(m => {
                    const values = selectedStats.map(s => s[m.key]);
                    const rowMin = Math.min(...values);
                    const rowMax = Math.max(...values);
                    return (
                      <tr key={m.key}>
                        <td className="px-4 py-2 align-middle">
                          <div className="text-xs font-medium">{m.label}</div>
                          <div className="text-[10px] text-muted-foreground">{m.sub}</div>
                        </td>
                        {selectedStats.map((s, i) => (
                          <td key={s.name} className="px-2 py-2 align-middle">
                            <MatrixCell
                              value={s[m.key]}
                              rowMin={rowMin}
                              rowMax={rowMax}
                              higherIsBetter={m.higherIsBetter}
                              isBest={winners[m.key] === s.name}
                              color={colorOf(i)}
                              format={m.format}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trend chart (unchanged) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Price per m² over time</CardTitle>
              <CardDescription>
                {tipoVenda === 'compra' ? 'Sale' : 'Rent'} €/m² history — weighted by listing volume.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {/* Compare variant: straight-segment lines with visible
                      dots so you can read off the raw monthly value at each
                      side-by-side data point, plus a solid horizontal grid
                      for precise visual alignment between scopes. */}
                  <LineChart data={combinedChart} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid stroke={gridColor} vertical={false} />
                    <XAxis
                      dataKey="mes_ano"
                      tick={{ fill: textColor, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={40}
                    />
                    <YAxis
                      tickFormatter={v => `€${Math.round(v / 100) * 100}`}
                      tick={{ fill: textColor, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={72}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                        borderRadius: '8px',
                        color: isDark ? '#f1f5f9' : '#0f172a',
                        fontSize: '12px',
                      }}
                      formatter={(value: any) => fmtM2(Number(value))}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '11px' }}
                      iconType="plainline"
                    />
                    {selected.map((name, i) => (
                      <Line
                        key={name}
                        type="linear"
                        dataKey={name}
                        stroke={colorOf(i)}
                        strokeWidth={2.5}
                        dot={{ r: 2, fill: colorOf(i), strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
