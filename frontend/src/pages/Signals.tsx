import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Activity, BedDouble, ChevronDown, Coins, Hammer, Hotel, MapPin, Plus, Search, TrendingUp, Users, X,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDashboard } from '@/context/DashboardContext';
import { cn } from '@/lib/utils';
import type { HabitacaoRecord } from '@/lib/types';

type SignalKind =
  | 'trends'
  | 'dormidas'
  | 'capacity'
  | 'construction'
  | 'earnings'
  | 'foreigners';

// 1:1 muni name match between every signal dataset and the property dataset,
// so the AML list also doubles as the price-side filter when the user picks
// "All AML".
const AML_MUNICIPALITIES = [
  'Alcochete', 'Almada', 'Amadora', 'Barreiro', 'Cascais', 'Lisboa', 'Loures',
  'Mafra', 'Moita', 'Montijo', 'Odivelas', 'Oeiras', 'Palmela', 'Seixal',
  'Sesimbra', 'Setúbal', 'Sintra', 'Vila Franca de Xira',
] as const;

const AML_AGGREGATE_NAME = 'Área Metropolitana de Lisboa';
const ALL_AML_OPTION = '__ALL_AML__';

// All signal data is clipped to this start month so the chart, the indexing
// baseline, and the KPI window all share a consistent floor.
const MIN_MONTH = '2012-01';

const PRICE_COLOR = '#6366f1';   // indigo

// ── Signal registry ─────────────────────────────────────────────────────────
// Adding a new dataset = adding one entry here + a small case in
// `buildAnnualSeries` if its value-key isn't already covered.

interface SignalConfig {
  id: SignalKind;
  label: string;            // chip / KPI label
  short: string;            // short legend label
  color: string;
  icon: LucideIcon;
  url: string;
  cadence: 'monthly' | 'annual';
  agg: 'sum' | 'mean';      // how to combine across munis when "All AML"
  fmt: (v: number) => string;
  description: string;      // footnote
  scopeNote?: string;       // tooltip / sub-text (e.g. "national series")
}

const fmtBigInt = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
  : v >= 1_000 ? `${(v / 1_000).toFixed(0)}k`
  : Math.round(v).toString();

const fmtEuro = (v: number) => `€${Math.round(v).toLocaleString('pt-PT')}`;

const SIGNALS: SignalConfig[] = [
  {
    id: 'trends',
    label: 'Google Trends',
    short: 'Search interest',
    color: '#f59e0b',
    icon: Search,
    url: '/data/google-trends.json',
    cadence: 'monthly',
    agg: 'mean',
    fmt: v => Math.round(v).toString(),
    description: 'Weekly Google Trends score for the keyword "Lisbon", averaged to monthly values.',
    scopeNote: 'Lisbon (national series — no per-muni split)',
  },
  {
    id: 'dormidas',
    label: 'Tourism overnights',
    short: 'Overnights',
    color: '#10b981',
    icon: BedDouble,
    url: '/data/ine-dormidas.json',
    cadence: 'monthly',
    agg: 'sum',
    fmt: fmtBigInt,
    description: 'INE monthly overnights (dormidas) per municipality.',
  },
  {
    id: 'capacity',
    label: 'Tourist capacity',
    short: 'Capacity',
    color: '#06b6d4',
    icon: Hotel,
    url: '/data/tourist-capacity.json',
    cadence: 'annual',
    agg: 'sum',
    fmt: fmtBigInt,
    description: 'INE annual lodging capacity per municipality.',
  },
  {
    id: 'construction',
    label: 'Completed buildings',
    short: 'New buildings',
    color: '#8b5cf6',
    icon: Hammer,
    url: '/data/completed-constructions.json',
    cadence: 'annual',
    agg: 'sum',
    fmt: fmtBigInt,
    description: 'INE annual completed building constructions per municipality.',
  },
  {
    id: 'earnings',
    label: 'Monthly earnings',
    short: 'Earnings',
    color: '#ec4899',
    icon: Coins,
    url: '/data/monthly-earnings.json',
    cadence: 'annual',
    agg: 'mean',
    fmt: fmtEuro,
    description: 'INE annual mean monthly earnings (€) per municipality.',
  },
  {
    id: 'foreigners',
    label: 'Foreign workers',
    short: 'Foreign workers',
    color: '#f97316',
    icon: Users,
    url: '/data/working-foreigners.json',
    cadence: 'annual',
    agg: 'sum',
    fmt: fmtBigInt,
    description: 'INE annual count of foreign workers per municipality.',
  },
];

// Each annual dataset uses its own metric column; map id → field name once.
const ANNUAL_FIELD: Record<SignalKind, string | null> = {
  trends: null,
  dormidas: null,
  capacity: 'tourist_capacity',
  construction: 'completed_constructions',
  earnings: 'monthly_earnings',
  foreigners: 'foreign_workers',
};

// ── Utility hooks ───────────────────────────────────────────────────────────

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

function useJson<T>(url: string): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((json: T) => { if (!cancelled) setData(json); })
      .catch(err => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [url]);
  return { data, error };
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const denom = Math.sqrt(da * db);
  return denom > 0 ? num / denom : 0;
}

function describeCorrelation(r: number) {
  const a = Math.abs(r);
  if (a > 0.7) return 'Strong';
  if (a > 0.4) return 'Moderate';
  if (a > 0.2) return 'Weak';
  return 'Negligible';
}

// ── Series builders ─────────────────────────────────────────────────────────

function buildPriceSeries(
  rows: HabitacaoRecord[],
  tipoVenda: 'compra' | 'arrendamento',
  munis: ReadonlySet<string>,
): Array<{ mes_ano: string; value: number }> {
  const map = new Map<string, { w: number; tot: number }>();
  for (const r of rows) {
    if (r.tipo_venda !== tipoVenda) continue;
    if (!munis.has(r.municipio)) continue;
    const cur = map.get(r.mes_ano) ?? { w: 0, tot: 0 };
    map.set(r.mes_ano, {
      w: cur.w + r.avg_m2 * r.total_rows,
      tot: cur.tot + r.total_rows,
    });
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes_ano, { w, tot }]) => ({ mes_ano, value: tot > 0 ? w / tot : 0 }))
    .filter(p => p.value > 0);
}

function buildSignalSeries(
  cfg: SignalConfig,
  raw: unknown[] | null,
  muniScope: string, // ALL_AML_OPTION or muni name
): Array<{ mes_ano: string; value: number }> {
  if (!raw) return [];

  if (cfg.id === 'trends') {
    // Weekly national series — collapse to monthly mean. No muni filter.
    const map = new Map<string, { sum: number; n: number }>();
    for (const p of raw as Array<{ date: string; Lisbon: number }>) {
      const key = p.date.slice(0, 7);
      const cur = map.get(key) ?? { sum: 0, n: 0 };
      map.set(key, { sum: cur.sum + p.Lisbon, n: cur.n + 1 });
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes_ano, { sum, n }]) => ({ mes_ano, value: n > 0 ? sum / n : 0 }));
  }

  if (cfg.id === 'dormidas') {
    const target = muniScope === ALL_AML_OPTION ? AML_AGGREGATE_NAME : muniScope;
    return (raw as Array<{ date: string; municipio: string; dormidas: number }>)
      .filter(p => p.municipio === target)
      .map(p => ({ mes_ano: p.date.slice(0, 7), value: p.dormidas }))
      .sort((a, b) => a.mes_ano.localeCompare(b.mes_ano));
  }

  // Annual datasets — a (muni, year) can have multiple sub-rows that we sum
  // first, then either pick a single muni or aggregate across munis.
  const field = ANNUAL_FIELD[cfg.id];
  if (!field) return [];

  const rows = raw as Array<Record<string, unknown>>;
  const perMuniYear = new Map<string, number>();
  for (const r of rows) {
    const muni = r.municipio as string;
    if (muniScope !== ALL_AML_OPTION && muni !== muniScope) continue;
    const key = `${muni}|${r.year}`;
    perMuniYear.set(key, (perMuniYear.get(key) ?? 0) + (r[field] as number));
  }

  const perYear = new Map<number, { sum: number; n: number }>();
  for (const [key, v] of perMuniYear.entries()) {
    const year = Number(key.split('|')[1]);
    const cur = perYear.get(year) ?? { sum: 0, n: 0 };
    perYear.set(year, { sum: cur.sum + v, n: cur.n + 1 });
  }

  return [...perYear.entries()]
    .sort(([a], [b]) => a - b)
    // Park each year's value at mid-year so the line interpolates cleanly
    // across the monthly time axis used by the chart.
    .map(([year, { sum, n }]) => ({
      mes_ano: `${year}-06`,
      value: cfg.agg === 'mean' && n > 0 ? sum / n : sum,
    }));
}

// Universe of munis available across the loaded annual + dormidas datasets.
function collectAvailableMunis(rawByKind: Partial<Record<SignalKind, unknown[]>>): string[] {
  const set = new Set<string>();
  for (const cfg of SIGNALS) {
    const raw = rawByKind[cfg.id];
    if (!raw || cfg.id === 'trends') continue;
    for (const r of raw as Array<{ municipio?: string }>) {
      if (r.municipio && r.municipio !== AML_AGGREGATE_NAME) set.add(r.municipio);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt'));
}

// ─────────────────────────────────────────────────────────────────────────────

export function Signals() {
  const { districtData, tipoVenda } = useDashboard();
  const isDark = useIsDark();

  // Multi-signal selection. At least one must remain on.
  const [active, setActive] = useState<Set<SignalKind>>(
    () => new Set<SignalKind>(['trends', 'dormidas']),
  );
  const [mode, setMode] = useState<'raw' | 'indexed'>('indexed');
  const [muniScope, setMuniScope] = useState<string>(ALL_AML_OPTION);

  const trendsQ      = useJson<unknown[]>('/data/google-trends.json');
  const dormidasQ    = useJson<unknown[]>('/data/ine-dormidas.json');
  const capacityQ    = useJson<unknown[]>('/data/tourist-capacity.json');
  const constructionQ= useJson<unknown[]>('/data/completed-constructions.json');
  const earningsQ    = useJson<unknown[]>('/data/monthly-earnings.json');
  const foreignersQ  = useJson<unknown[]>('/data/working-foreigners.json');

  const rawByKind = useMemo<Partial<Record<SignalKind, unknown[]>>>(() => ({
    trends: trendsQ.data ?? undefined,
    dormidas: dormidasQ.data ?? undefined,
    capacity: capacityQ.data ?? undefined,
    construction: constructionQ.data ?? undefined,
    earnings: earningsQ.data ?? undefined,
    foreigners: foreignersQ.data ?? undefined,
  }), [trendsQ.data, dormidasQ.data, capacityQ.data, constructionQ.data, earningsQ.data, foreignersQ.data]);

  const errorByKind: Partial<Record<SignalKind, string>> = {
    trends: trendsQ.error ?? undefined,
    dormidas: dormidasQ.error ?? undefined,
    capacity: capacityQ.error ?? undefined,
    construction: constructionQ.error ?? undefined,
    earnings: earningsQ.error ?? undefined,
    foreigners: foreignersQ.error ?? undefined,
  };

  function toggleSignal(s: SignalKind) {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(s)) {
        if (next.size === 1) return prev; // keep at least one on
        next.delete(s);
      } else {
        next.add(s);
      }
      return next;
    });
  }

  const activeConfigs = useMemo(
    () => SIGNALS.filter(s => active.has(s.id)),
    [active],
  );

  // Muni picker is only relevant for signals that carry per-muni data.
  const anyMuniSignalActive = activeConfigs.some(c => c.id !== 'trends');
  const availableMunis = useMemo(() => collectAvailableMunis(rawByKind), [rawByKind]);

  // Price scope: lock to Lisboa when only the (national) trends signal is on,
  // otherwise follow the muni picker.
  const priceMunis = useMemo<ReadonlySet<string>>(() => {
    if (anyMuniSignalActive) {
      if (muniScope === ALL_AML_OPTION) return new Set(AML_MUNICIPALITIES);
      return new Set([muniScope]);
    }
    return new Set(['Lisboa']);
  }, [anyMuniSignalActive, muniScope]);

  const priceScopeLabel = anyMuniSignalActive
    ? (muniScope === ALL_AML_OPTION ? 'AML' : muniScope)
    : 'Lisboa';

  const priceSeries = useMemo(
    () => buildPriceSeries(districtData, tipoVenda, priceMunis)
      .filter(p => p.mes_ano >= MIN_MONTH),
    [districtData, tipoVenda, priceMunis],
  );

  // Per-signal series, only computed when active. Same MIN_MONTH floor applied
  // here so the indexing baseline / first-observation rebases against post-2012
  // data instead of the original (much earlier) source date.
  const signalSeriesById = useMemo(() => {
    const out: Partial<Record<SignalKind, Array<{ mes_ano: string; value: number }>>> = {};
    for (const cfg of activeConfigs) {
      out[cfg.id] = buildSignalSeries(cfg, rawByKind[cfg.id] ?? null, muniScope)
        .filter(p => p.mes_ano >= MIN_MONTH);
    }
    return out;
  }, [activeConfigs, rawByKind, muniScope]);

  // Effective display mode — Raw is only meaningful with one signal at a time
  // (multiple units can't share the same right-axis). Otherwise force Indexed.
  const effectiveMode: 'raw' | 'indexed' = activeConfigs.length > 1 ? 'indexed' : mode;

  // ── Merge → chart data + per-signal stats ─────────────────────────────────

  type MergedPoint = {
    mes_ano: string;
    price: number | null;
    priceIdx: number | null;
    [k: string]: number | null | string;
  };

  const merged = useMemo(() => {
    const priceMap = new Map(priceSeries.map(p => [p.mes_ano, p.value]));
    const signalMaps: Record<string, Map<string, number>> = {};
    for (const cfg of activeConfigs) {
      signalMaps[cfg.id] = new Map((signalSeriesById[cfg.id] ?? []).map(p => [p.mes_ano, p.value]));
    }

    const months = [...new Set([
      ...priceMap.keys(),
      ...activeConfigs.flatMap(c => [...signalMaps[c.id].keys()]),
    ])].sort();

    const firstObs = (m: Map<string, number>) => {
      for (const k of months) if (m.has(k)) return { mes_ano: k, value: m.get(k)! };
      return null;
    };
    const lastObs = (m: Map<string, number>) => {
      for (let i = months.length - 1; i >= 0; i--) {
        const k = months[i];
        if (m.has(k)) return { mes_ano: k, value: m.get(k)! };
      }
      return null;
    };

    const priceFirst = firstObs(priceMap);
    const priceLast = lastObs(priceMap);
    const basePrice = priceFirst?.value ?? 0;

    const signalStats: Partial<Record<SignalKind, {
      first: { mes_ano: string; value: number } | null;
      last: { mes_ano: string; value: number } | null;
      base: number;
      change: number;
      correlation: number;
    }>> = {};

    for (const cfg of activeConfigs) {
      const map = signalMaps[cfg.id];
      const f = firstObs(map);
      const l = lastObs(map);
      const base = f?.value ?? 0;

      // Pearson over months where BOTH this signal and price have a value.
      const ax: number[] = [], ay: number[] = [];
      for (const m of months) {
        const pv = priceMap.get(m);
        const sv = map.get(m);
        if (pv != null && sv != null) { ax.push(pv); ay.push(sv); }
      }

      const lastVal = l?.value ?? base;
      signalStats[cfg.id] = {
        first: f, last: l, base,
        change: base > 0 ? ((lastVal - base) / base) * 100 : 0,
        correlation: pearson(ax, ay),
      };
    }

    const points: MergedPoint[] = months.map(mes_ano => {
      const pt: MergedPoint = {
        mes_ano,
        price: priceMap.get(mes_ano) ?? null,
        priceIdx: priceMap.has(mes_ano) && basePrice > 0
          ? (priceMap.get(mes_ano)! / basePrice) * 100
          : null,
      };
      for (const cfg of activeConfigs) {
        const v = signalMaps[cfg.id].get(mes_ano) ?? null;
        pt[`s_${cfg.id}`] = v;
        const stat = signalStats[cfg.id]!;
        pt[`i_${cfg.id}`] = v != null && stat.base > 0 ? (v / stat.base) * 100 : null;
      }
      return pt;
    });

    const lastPriceVal = priceLast?.value ?? basePrice;
    return {
      points,
      windowFirst: months[0] ?? null,
      windowLast: months[months.length - 1] ?? null,
      priceFirst, priceLast,
      priceChange: basePrice > 0 ? ((lastPriceVal - basePrice) / basePrice) * 100 : 0,
      signalStats,
    };
  }, [priceSeries, activeConfigs, signalSeriesById]);

  const { points, windowFirst, windowLast, priceFirst, priceLast, priceChange, signalStats } = merged;

  // ── Display strings & axis helpers ────────────────────────────────────────

  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';

  const fmtPrice = (v: number) => `€${Math.round(v).toLocaleString('pt-PT')}`;
  const fmtIdx = (v: number) => `${v >= 100 ? '+' : ''}${(v - 100).toFixed(1)}%`;

  const priceLineLabel = `€/m² · ${priceScopeLabel}`;
  const lineLabelFor = (cfg: SignalConfig) => {
    if (cfg.id === 'trends') return 'Search interest · Lisbon';
    return `${cfg.short} · ${muniScope === ALL_AML_OPTION ? 'AML' : muniScope}`;
  };

  const hasPriceData = priceSeries.length > 0;
  const loadingSignals = activeConfigs.filter(
    c => rawByKind[c.id] === undefined && !errorByKind[c.id],
  );
  const erroredSignals = activeConfigs.filter(c => errorByKind[c.id]);
  const isLoadingAny = loadingSignals.length > 0;

  // For raw mode (single signal) — use that signal's formatter for the right axis.
  const lonelySignal = activeConfigs.length === 1 ? activeConfigs[0] : null;

  // ── Tooltip helpers ───────────────────────────────────────────────────────
  // Annual signals only have one observation per year (placed at YYYY-06), so
  // hovering on any other month would normally show no value. Carry the most
  // recent observation forward and tag the row with its source year so the
  // user always sees something — and knows it's not the exact-month value.

  const fmtMonth = (mes: string) => {
    const [y, mm] = mes.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const i = Number(mm) - 1;
    return `${names[i] ?? mm} ${y}`;
  };

  function lookupAtOrBefore(
    series: Array<{ mes_ano: string; value: number }>,
    label: string,
  ): { mes_ano: string; value: number } | null {
    let best: { mes_ano: string; value: number } | null = null;
    for (const p of series) {
      if (p.mes_ano > label) break;
      best = p;
    }
    return best;
  }

  // Source-month tag: annual signals show "(2019)" since their observation is
  // always YYYY-06; everything else shows the full month "(Jun 2019)".
  const sourceTag = (sourceMes: string, hoveredMes: string, isAnnual: boolean) => {
    if (sourceMes === hoveredMes) return null;
    return isAnnual ? sourceMes.split('-')[0] : fmtMonth(sourceMes);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
          <Activity className="h-3 w-3 text-amber-500" />
          External signals
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Signals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare {priceScopeLabel} {tipoVenda === 'compra' ? 'sale' : 'rental'} prices against
          search interest, tourism, construction, earnings, and labour signals — overlay any
          combination to see which one moves with the market.
        </p>
      </div>

      {/* Controls — chips on top row, filters/view on bottom row */}
      <Card>
        <CardContent className="flex flex-col gap-3 px-4 py-3">
          {/* Row 1: active signal chips + an "Add signal" dropdown */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <ToolbarLabel>Compare</ToolbarLabel>
            {activeConfigs.map(cfg => (
              <ActiveSignalChip
                key={cfg.id}
                cfg={cfg}
                onRemove={() => toggleSignal(cfg.id)}
                canRemove={activeConfigs.length > 1}
              />
            ))}
            {activeConfigs.length < SIGNALS.length && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <Plus className="h-3 w-3" />
                  Add signal
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[220px]">
                  {SIGNALS.filter(cfg => !active.has(cfg.id)).map(cfg => {
                    const Icon = cfg.icon;
                    return (
                      <DropdownMenuItem
                        key={cfg.id}
                        onClick={() => toggleSignal(cfg.id)}
                        className="flex cursor-pointer items-center gap-2 text-xs"
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {cfg.label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Row 2: muni picker on the left, view toggle on the right. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-3">
            <div className="flex items-center gap-3">
              {anyMuniSignalActive ? (
                <div className="flex items-center gap-2">
                  <ToolbarLabel>In</ToolbarLabel>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-[11px] font-medium shadow-sm transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      {muniScope === ALL_AML_OPTION ? 'All AML' : muniScope}
                      <ChevronDown className="h-3 w-3 text-muted-foreground/70" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-[280px] w-[220px] overflow-y-auto">
                      <DropdownMenuRadioGroup value={muniScope} onValueChange={setMuniScope}>
                        <DropdownMenuRadioItem value={ALL_AML_OPTION} className="text-xs">
                          All AML (default)
                        </DropdownMenuRadioItem>
                        <DropdownMenuSeparator />
                        {availableMunis.map(m => (
                          <DropdownMenuRadioItem key={m} value={m} className="text-xs">
                            {m}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : (
                <span className="text-[11px] text-muted-foreground/60">
                  Lisbon · national series only
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <ToolbarLabel>View</ToolbarLabel>
              <div className="inline-flex items-center gap-0.5 rounded-full border border-border/50 bg-muted/30 p-1">
                <button
                  onClick={() => setMode('indexed')}
                  className={cn(
                    'rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
                    effectiveMode === 'indexed'
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Indexed
                </button>
                <button
                  onClick={() => activeConfigs.length === 1 && setMode('raw')}
                  disabled={activeConfigs.length > 1}
                  title={activeConfigs.length > 1
                    ? 'Raw mode is only available with a single signal selected'
                    : undefined}
                  className={cn(
                    'rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
                    effectiveMode === 'raw'
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                      : 'text-muted-foreground hover:text-foreground',
                    activeConfigs.length > 1 && 'cursor-not-allowed opacity-40',
                  )}
                >
                  Raw
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs — Price card on the left grows to match the signals card on the
          right (default grid stretch). Inside the price card we use a vertical
          flex so the big number stays centered as the card grows. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex flex-col">
          <CardContent className="flex flex-1 flex-col py-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">
              <TrendingUp className="h-3 w-3" style={{ color: PRICE_COLOR }} />
              €/m² change · {priceScopeLabel}
            </div>

            <div className="flex flex-1 items-center justify-center py-3">
              <div
                className={cn(
                  'text-4xl font-semibold tabular-nums leading-none',
                  priceChange >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400',
                )}
              >
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(1)}%
              </div>
            </div>

            {priceFirst && priceLast && (
              <div className="text-[11px] tabular-nums text-muted-foreground">
                {fmtPrice(priceFirst.value)}
                <span className="text-muted-foreground/60"> ({priceFirst.mes_ano})</span>
                <span className="mx-1.5 text-muted-foreground/50">→</span>
                {fmtPrice(priceLast.value)}
                <span className="text-muted-foreground/60"> ({priceLast.mes_ano})</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="py-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Activity className="h-3 w-3" />
                Active signals · change & correlation with price
              </span>
              <span className="tabular-nums text-[10px] text-muted-foreground/70">
                window {windowFirst ?? '—'} → {windowLast ?? '—'}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {activeConfigs.map(cfg => {
                const stat = signalStats[cfg.id];
                if (!stat) return null;
                const noData = stat.first === null;
                const Icon = cfg.icon;
                return (
                  <div
                    key={cfg.id}
                    className="flex items-center justify-between gap-3 border-t border-border/30 py-2 first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: cfg.color }} />
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-xs font-medium">{cfg.short}</span>
                    </div>
                    {noData ? (
                      <span className="text-[10px] text-muted-foreground/70">no data for scope</span>
                    ) : (
                      <div className="flex items-baseline gap-3 tabular-nums">
                        <span className={cn(
                          'text-sm font-semibold',
                          stat.change >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400',
                        )}>
                          {stat.change >= 0 ? '+' : ''}{stat.change.toFixed(1)}%
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ρ {stat.correlation.toFixed(2)}
                          <span className="ml-1 text-[10px] text-muted-foreground/60">
                            {describeCorrelation(stat.correlation)}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time plot */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {effectiveMode === 'indexed'
              ? 'Indexed comparison over time'
              : `Price vs. ${lonelySignal?.short.toLowerCase() ?? 'signal'}`}
          </CardTitle>
          <CardDescription>
            {effectiveMode === 'indexed'
              ? 'Each line rebased to 100 at its own first observation, so series with different start dates are directly comparable.'
              : '€/m² on the left axis · raw signal on the right axis.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasPriceData ? (
            <ChartPlaceholder>Loading property data…</ChartPlaceholder>
          ) : isLoadingAny ? (
            <ChartPlaceholder>
              Loading {loadingSignals.map(s => s.short).join(' + ')}…
            </ChartPlaceholder>
          ) : erroredSignals.length > 0 ? (
            <ChartPlaceholder tone="error">
              Failed to load: {erroredSignals.map(s => `${s.short} (${errorByKind[s.id]})`).join(' · ')}
            </ChartPlaceholder>
          ) : points.length === 0 ? (
            <ChartPlaceholder>No data in the active series.</ChartPlaceholder>
          ) : (
            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis
                    dataKey="mes_ano"
                    tick={{ fill: textColor, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval={Math.max(0, Math.floor(points.length / 10))}
                  />

                  {effectiveMode === 'indexed' ? (
                    <YAxis
                      tickFormatter={v => `${Math.round(v - 100) >= 0 ? '+' : ''}${Math.round(v - 100)}%`}
                      tick={{ fill: textColor, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                    />
                  ) : (
                    <>
                      <YAxis
                        yAxisId="price"
                        orientation="left"
                        tickFormatter={v => `€${Math.round(v / 100) * 100}`}
                        tick={{ fill: PRICE_COLOR, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={64}
                      />
                      {lonelySignal && (
                        <YAxis
                          yAxisId="signal"
                          orientation="right"
                          tickFormatter={lonelySignal.fmt}
                          tick={{ fill: lonelySignal.color, fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          width={56}
                        />
                      )}
                    </>
                  )}

                  <Tooltip
                    cursor={{ stroke: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)', strokeWidth: 1, strokeDasharray: '3 3' }}
                    isAnimationActive={false}
                    content={({ active, label }) => {
                      if (!active || !label) return null;
                      const lbl = String(label);

                      const priceObs = lookupAtOrBefore(priceSeries, lbl);
                      const priceBase = priceFirst?.value ?? 0;

                      return (
                        <div
                          className="rounded-lg border px-3 py-2 shadow-lg"
                          style={{
                            backgroundColor: isDark ? 'rgba(15,23,42,0.96)' : 'rgba(255,255,255,0.98)',
                            border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
                            color: isDark ? '#f1f5f9' : '#0f172a',
                            fontSize: '12px',
                            minWidth: '220px',
                          }}
                        >
                          <div className="mb-1.5 text-[10px] tabular-nums text-muted-foreground">
                            {fmtMonth(lbl)}
                          </div>

                          <div className="space-y-1">
                            {priceObs && (
                              <TooltipRow
                                color={PRICE_COLOR}
                                label="€/m²"
                                scope={priceScopeLabel}
                                value={
                                  effectiveMode === 'indexed' && priceBase > 0
                                    ? fmtIdx((priceObs.value / priceBase) * 100)
                                    : fmtPrice(priceObs.value)
                                }
                                sourceTag={sourceTag(priceObs.mes_ano, lbl, false)}
                              />
                            )}
                            {activeConfigs.map(cfg => {
                              const series = signalSeriesById[cfg.id] ?? [];
                              const obs = lookupAtOrBefore(series, lbl);
                              const stat = signalStats[cfg.id];
                              const scope = cfg.id === 'trends'
                                ? 'Lisbon'
                                : (muniScope === ALL_AML_OPTION ? 'AML' : muniScope);
                              if (!obs || !stat) {
                                return (
                                  <TooltipRow
                                    key={cfg.id}
                                    color={cfg.color}
                                    label={cfg.short}
                                    scope={scope}
                                    value="—"
                                  />
                                );
                              }
                              const idxVal = stat.base > 0 ? (obs.value / stat.base) * 100 : null;
                              return (
                                <TooltipRow
                                  key={cfg.id}
                                  color={cfg.color}
                                  label={cfg.short}
                                  scope={scope}
                                  value={
                                    effectiveMode === 'indexed'
                                      ? (idxVal != null ? fmtIdx(idxVal) : '—')
                                      : cfg.fmt(obs.value)
                                  }
                                  sourceTag={sourceTag(obs.mes_ano, lbl, cfg.cadence === 'annual')}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                    iconType="plainline"
                  />

                  {effectiveMode === 'indexed' ? (
                    <>
                      <Line
                        type="monotone" dataKey="priceIdx" name={priceLineLabel}
                        stroke={PRICE_COLOR} strokeWidth={2.25} dot={false}
                        activeDot={{ r: 4 }} connectNulls
                      />
                      {activeConfigs.map(cfg => (
                        <Line
                          key={cfg.id}
                          type="monotone"
                          dataKey={`i_${cfg.id}`}
                          name={lineLabelFor(cfg)}
                          stroke={cfg.color}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls
                        />
                      ))}
                    </>
                  ) : (
                    <>
                      <Line
                        yAxisId="price" type="monotone" dataKey="price" name={priceLineLabel}
                        stroke={PRICE_COLOR} strokeWidth={2.25} dot={false}
                        activeDot={{ r: 4 }} connectNulls
                      />
                      {lonelySignal && (
                        <Line
                          yAxisId="signal"
                          type="monotone"
                          dataKey={`s_${lonelySignal.id}`}
                          name={lineLabelFor(lonelySignal)}
                          stroke={lonelySignal.color}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls
                        />
                      )}
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            Price: weighted €/m² across {priceScopeLabel} listings.
            {activeConfigs.map(cfg => (
              <span key={cfg.id}> {cfg.short}: {cfg.description}</span>
            ))}
            {' '}Annual datasets are placed at mid-year (June) and connected with a smooth line.
            {effectiveMode === 'indexed' && ' Indexed view rebases each line to 100 at its own first observation.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Small presentational helpers ──────────────────────────────────────────────

function ToolbarLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/60">
      {children}
    </span>
  );
}

function ActiveSignalChip({
  cfg, onRemove, canRemove,
}: {
  cfg: SignalConfig;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-foreground/[0.06] py-1.5 pl-2.5 pr-1 text-[11px] font-medium text-foreground shadow-sm ring-1 ring-border/60"
      style={{ boxShadow: `inset 0 0 0 1px ${cfg.color}40` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
      <Icon className="h-3 w-3" />
      {cfg.label}
      {canRemove ? (
        <button
          onClick={onRemove}
          aria-label={`Remove ${cfg.label}`}
          className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-foreground/[0.10] hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      ) : (
        <span className="w-1.5" aria-hidden />
      )}
    </span>
  );
}

function TooltipRow({
  color, label, scope, value, sourceTag,
}: {
  color: string;
  label: string;
  scope: string;
  value: string;
  sourceTag?: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 tabular-nums">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground/70">· {scope}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[12px] font-semibold" style={{ color }}>{value}</span>
        {sourceTag && (
          <span className="rounded bg-muted/40 px-1 py-px text-[9px] font-medium text-muted-foreground">
            {sourceTag}
          </span>
        )}
      </div>
    </div>
  );
}

function ChartPlaceholder({
  children, tone = 'muted',
}: { children: React.ReactNode; tone?: 'muted' | 'error' }) {
  return (
    <div
      className={cn(
        'flex h-[320px] items-center justify-center text-xs',
        tone === 'error' ? 'text-rose-500' : 'text-muted-foreground',
      )}
    >
      {children}
    </div>
  );
}
