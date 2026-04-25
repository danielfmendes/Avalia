import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Activity, BedDouble, ChevronDown, MapPin, Search, TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDashboard } from '@/context/DashboardContext';
import { cn } from '@/lib/utils';
import type { HabitacaoRecord } from '@/lib/types';

type SignalKind = 'trends' | 'dormidas';

interface TrendPoint {
  date: string;   // "YYYY-MM-DD" (weekly)
  Lisbon: number; // Google Trends score (0–100+)
}

interface DormidasPoint {
  date: string;   // "YYYY-MM-DD" (monthly, 1st of month)
  municipio: string;
  geo_code: number;
  geo_level: string;
  dormidas: number;
}

interface MergedPoint {
  mes_ano: string;
  price: number | null;
  trends: number | null;
  dormidas: number | null;
  priceIdx: number | null;
  trendsIdx: number | null;
  dormidasIdx: number | null;
}

// 1:1 name match between the dormidas dataset and the property dataset, so the
// list also doubles as a price-side filter for the "All AML" aggregate.
const AML_MUNICIPALITIES = [
  'Alcochete', 'Almada', 'Amadora', 'Barreiro', 'Cascais', 'Lisboa', 'Loures',
  'Mafra', 'Moita', 'Montijo', 'Odivelas', 'Oeiras', 'Palmela', 'Seixal',
  'Sesimbra', 'Setúbal', 'Sintra', 'Vila Franca de Xira',
] as const;

const AML_AGGREGATE_NAME = 'Área Metropolitana de Lisboa';
const ALL_AML_OPTION = '__ALL_AML__';

const PRICE_COLOR = '#6366f1';   // indigo
const TRENDS_COLOR = '#f59e0b';  // amber
const DORMIDAS_COLOR = '#10b981';// emerald

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

function describeCorrelation(r: number) {
  const a = Math.abs(r);
  if (a > 0.7) return 'Strong';
  if (a > 0.4) return 'Moderate';
  if (a > 0.2) return 'Weak';
  return 'Negligible';
}

export function Signals() {
  const { districtData, tipoVenda } = useDashboard();
  const isDark = useIsDark();

  // Multi-signal selection. At least one must remain on.
  const [active, setActive] = useState<Set<SignalKind>>(
    () => new Set<SignalKind>(['trends', 'dormidas']),
  );
  const [mode, setMode] = useState<'raw' | 'indexed'>('indexed');
  const [dormidasMuni, setDormidasMuni] = useState<string>(ALL_AML_OPTION);

  const [rawTrends, setRawTrends] = useState<TrendPoint[] | null>(null);
  const [trendsError, setTrendsError] = useState<string | null>(null);
  const [rawDormidas, setRawDormidas] = useState<DormidasPoint[] | null>(null);
  const [dormidasError, setDormidasError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/data/google-trends.json')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((json: TrendPoint[]) => { if (!cancelled) setRawTrends(json); })
      .catch(err => { if (!cancelled) setTrendsError((err as Error).message); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/data/ine-dormidas.json')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((json: DormidasPoint[]) => { if (!cancelled) setRawDormidas(json); })
      .catch(err => { if (!cancelled) setDormidasError((err as Error).message); });
    return () => { cancelled = true; };
  }, []);

  const trendsOn = active.has('trends');
  const dormidasOn = active.has('dormidas');
  const bothOn = trendsOn && dormidasOn;
  const effectiveMode = bothOn ? 'indexed' : mode;

  function toggleSignal(s: SignalKind) {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(s)) {
        if (next.size === 1) return prev; // keep at least one
        next.delete(s);
      } else {
        next.add(s);
      }
      return next;
    });
  }

  // Municipality options exposed in the dormidas dropdown — exclude the AML
  // aggregate row since it's surfaced via the "All AML" entry instead.
  const availableDormidasMunis = useMemo(() => {
    if (!rawDormidas) return [] as string[];
    const set = new Set<string>();
    for (const p of rawDormidas) {
      if (p.municipio === AML_AGGREGATE_NAME) continue;
      set.add(p.municipio);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt'));
  }, [rawDormidas]);

  // Price scope: when only trends is active we lock to Lisboa to keep parity
  // with the "Lisbon" search keyword; otherwise we follow the dormidas selector.
  const priceMunis = useMemo<ReadonlySet<string>>(() => {
    if (dormidasOn) {
      if (dormidasMuni === ALL_AML_OPTION) return new Set(AML_MUNICIPALITIES);
      return new Set([dormidasMuni]);
    }
    return new Set(['Lisboa']);
  }, [dormidasOn, dormidasMuni]);

  const priceScopeLabel = dormidasOn
    ? (dormidasMuni === ALL_AML_OPTION ? 'AML (18 munis)' : dormidasMuni)
    : 'Lisboa';

  const priceSeries = useMemo(
    () => buildPriceSeries(districtData, tipoVenda, priceMunis),
    [districtData, tipoVenda, priceMunis],
  );

  const trendsSeries = useMemo<Array<{ mes_ano: string; value: number }>>(() => {
    if (!rawTrends) return [];
    const map = new Map<string, { sum: number; n: number }>();
    for (const p of rawTrends) {
      const mes_ano = p.date.slice(0, 7);
      const cur = map.get(mes_ano) ?? { sum: 0, n: 0 };
      map.set(mes_ano, { sum: cur.sum + p.Lisbon, n: cur.n + 1 });
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes_ano, { sum, n }]) => ({ mes_ano, value: n > 0 ? sum / n : 0 }));
  }, [rawTrends]);

  const dormidasSeries = useMemo<Array<{ mes_ano: string; value: number }>>(() => {
    if (!rawDormidas) return [];
    const targetName = dormidasMuni === ALL_AML_OPTION ? AML_AGGREGATE_NAME : dormidasMuni;
    return rawDormidas
      .filter(p => p.municipio === targetName)
      .map(p => ({ mes_ano: p.date.slice(0, 7), value: p.dormidas }))
      .sort((a, b) => a.mes_ano.localeCompare(b.mes_ano));
  }, [rawDormidas, dormidasMuni]);

  const merged = useMemo(() => {
    const priceMap = new Map(priceSeries.map(p => [p.mes_ano, p.value]));
    const trendsMap = trendsOn ? new Map(trendsSeries.map(p => [p.mes_ano, p.value])) : null;
    const dormidasMap = dormidasOn ? new Map(dormidasSeries.map(p => [p.mes_ano, p.value])) : null;

    const monthSets = [priceMap, trendsMap, dormidasMap].filter(Boolean) as Map<string, number>[];
    // Window = full union of months across active series — each line just
    // appears when its data starts and disappears when it ends, with no
    // forced overlap requirement.
    const months = [...new Set(monthSets.flatMap(m => [...m.keys()]))].sort();

    // Per-line first/last observation drives both the indexing baseline and
    // the KPI date range, so a line with shorter coverage rebases against
    // its own start instead of being forced onto a shared anchor.
    const firstObs = (map: Map<string, number> | null) => {
      if (!map) return null;
      for (const m of months) if (map.has(m)) return { mes_ano: m, value: map.get(m)! };
      return null;
    };
    const lastObs = (map: Map<string, number> | null) => {
      if (!map) return null;
      for (let i = months.length - 1; i >= 0; i--) {
        const m = months[i];
        if (map.has(m)) return { mes_ano: m, value: map.get(m)! };
      }
      return null;
    };

    const priceFirst = firstObs(priceMap);
    const trendsFirst = firstObs(trendsMap);
    const dormidasFirst = firstObs(dormidasMap);
    const priceLast = lastObs(priceMap);
    const trendsLast = lastObs(trendsMap);
    const dormidasLast = lastObs(dormidasMap);

    const basePrice = priceFirst?.value ?? 0;
    const baseTrends = trendsFirst?.value ?? 0;
    const baseDormidas = dormidasFirst?.value ?? 0;

    const points: MergedPoint[] = months.map(mes_ano => {
      const price = priceMap.get(mes_ano) ?? null;
      const t = trendsMap?.get(mes_ano) ?? null;
      const d = dormidasMap?.get(mes_ano) ?? null;
      return {
        mes_ano,
        price,
        trends: t,
        dormidas: d,
        priceIdx: price != null && basePrice > 0 ? (price / basePrice) * 100 : null,
        trendsIdx: t != null && baseTrends > 0 ? (t / baseTrends) * 100 : null,
        dormidasIdx: d != null && baseDormidas > 0 ? (d / baseDormidas) * 100 : null,
      };
    });

    // Correlation only makes sense over the months where BOTH series have a
    // value, regardless of where each line individually starts/ends.
    const trendsVals: number[] = [];
    const dormidasVals: number[] = [];
    const trendsPriceVals: number[] = [];
    const dormidasPriceVals: number[] = [];
    for (const p of points) {
      if (p.price != null && p.trends != null) {
        trendsPriceVals.push(p.price);
        trendsVals.push(p.trends);
      }
      if (p.price != null && p.dormidas != null) {
        dormidasPriceVals.push(p.price);
        dormidasVals.push(p.dormidas);
      }
    }

    const pct = (first: number, last: number) =>
      first > 0 ? ((last - first) / first) * 100 : 0;

    return {
      points,
      windowFirst: months[0] ?? null,
      windowLast: months[months.length - 1] ?? null,
      priceFirstMonth: priceFirst?.mes_ano ?? null,
      priceLastMonth: priceLast?.mes_ano ?? null,
      trendsFirstMonth: trendsFirst?.mes_ano ?? null,
      trendsLastMonth: trendsLast?.mes_ano ?? null,
      dormidasFirstMonth: dormidasFirst?.mes_ano ?? null,
      dormidasLastMonth: dormidasLast?.mes_ano ?? null,
      priceChange: pct(basePrice, priceLast?.value ?? basePrice),
      trendsChange: pct(baseTrends, trendsLast?.value ?? baseTrends),
      dormidasChange: pct(baseDormidas, dormidasLast?.value ?? baseDormidas),
      corrTrends: pearson(trendsPriceVals, trendsVals),
      corrDormidas: pearson(dormidasPriceVals, dormidasVals),
    };
  }, [priceSeries, trendsSeries, dormidasSeries, trendsOn, dormidasOn]);

  const {
    points,
    windowFirst, windowLast,
    priceFirstMonth, priceLastMonth,
    trendsFirstMonth, trendsLastMonth,
    dormidasFirstMonth, dormidasLastMonth,
    priceChange, trendsChange, dormidasChange,
    corrTrends, corrDormidas,
  } = merged;

  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';

  const fmtPrice = (v: number) => `€${Math.round(v).toLocaleString('pt-PT')}`;
  const fmtIdx = (v: number) => `${v >= 100 ? '+' : ''}${(v - 100).toFixed(1)}%`;
  const fmtBigInt = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000 ? `${(v / 1_000).toFixed(0)}k`
    : Math.round(v).toString();

  const priceLineScope = dormidasOn && dormidasMuni === ALL_AML_OPTION ? 'AML' : priceScopeLabel;
  const priceLineLabel = `€/m² · ${priceLineScope}`;
  const trendsLineLabel = 'Search interest · Lisbon';
  const dormidasLineLabel = `Overnights · ${dormidasMuni === ALL_AML_OPTION ? 'AML' : dormidasMuni}`;

  const hasPriceData = priceSeries.length > 0;
  const isLoadingTrends = trendsOn && rawTrends === null && trendsError === null;
  const isLoadingDormidas = dormidasOn && rawDormidas === null && dormidasError === null;
  const fetchError =
    (trendsOn && trendsError) ? `Trends: ${trendsError}` :
    (dormidasOn && dormidasError) ? `Dormidas: ${dormidasError}` :
    null;

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
          search interest and tourism overnights — overlay both to see which one moves with the market.
        </p>
      </div>

      {/* Controls — single toolbar row */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
          <ToolbarLabel>Compare</ToolbarLabel>
          <div className="flex items-center gap-1.5">
            <SignalChip
              label="Google Trends"
              icon={Search}
              color={TRENDS_COLOR}
              active={trendsOn}
              onClick={() => toggleSignal('trends')}
            />
            <SignalChip
              label="Tourism overnights"
              icon={BedDouble}
              color={DORMIDAS_COLOR}
              active={dormidasOn}
              onClick={() => toggleSignal('dormidas')}
            />
          </div>

          {dormidasOn && (
            <>
              <ToolbarDivider />
              <ToolbarLabel>In</ToolbarLabel>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-[11px] font-medium shadow-sm transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  {dormidasMuni === ALL_AML_OPTION ? 'All AML' : dormidasMuni}
                  <ChevronDown className="h-3 w-3 text-muted-foreground/70" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-[280px] w-[220px] overflow-y-auto">
                  <DropdownMenuRadioGroup value={dormidasMuni} onValueChange={setDormidasMuni}>
                    <DropdownMenuRadioItem value={ALL_AML_OPTION} className="text-xs">
                      All AML (default)
                    </DropdownMenuRadioItem>
                    <DropdownMenuSeparator />
                    {availableDormidasMunis.map(m => (
                      <DropdownMenuRadioItem key={m} value={m} className="text-xs">
                        {m}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          {/* View toggle pinned right */}
          <div className="ml-auto flex items-center gap-2">
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
                onClick={() => !bothOn && setMode('raw')}
                disabled={bothOn}
                title={bothOn ? 'Raw mode is unavailable when comparing both signals' : undefined}
                className={cn(
                  'rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
                  effectiveMode === 'raw'
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                    : 'text-muted-foreground hover:text-foreground',
                  bothOn && 'cursor-not-allowed opacity-40',
                )}
              >
                Raw
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Price change"
          icon={TrendingUp}
          color={PRICE_COLOR}
          value={`${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(1)}%`}
          tone={priceChange >= 0 ? 'pos' : 'neg'}
          range={priceFirstMonth && priceLastMonth ? `${priceFirstMonth} → ${priceLastMonth}` : null}
        />
        {trendsOn && (
          <KpiCard
            label="Search interest change"
            icon={Search}
            color={TRENDS_COLOR}
            value={`${trendsChange >= 0 ? '+' : ''}${trendsChange.toFixed(1)}%`}
            tone={trendsChange >= 0 ? 'pos' : 'neg'}
            range={trendsFirstMonth && trendsLastMonth ? `${trendsFirstMonth} → ${trendsLastMonth}` : null}
          />
        )}
        {dormidasOn && (
          <KpiCard
            label="Overnights change"
            icon={BedDouble}
            color={DORMIDAS_COLOR}
            value={`${dormidasChange >= 0 ? '+' : ''}${dormidasChange.toFixed(1)}%`}
            tone={dormidasChange >= 0 ? 'pos' : 'neg'}
            range={dormidasFirstMonth && dormidasLastMonth ? `${dormidasFirstMonth} → ${dormidasLastMonth}` : null}
          />
        )}
        <Card className="col-span-2 lg:col-span-1">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Activity className="h-3 w-3 text-muted-foreground" />
              Correlation with price
            </div>
            <div className="mt-2 space-y-1.5">
              {trendsOn && (
                <CorrRow color={TRENDS_COLOR} label="Trends" value={corrTrends} />
              )}
              {dormidasOn && (
                <CorrRow color={DORMIDAS_COLOR} label="Overnights" value={corrDormidas} />
              )}
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
              : trendsOn
                ? 'Price vs. search interest'
                : 'Price vs. tourism overnights'}
          </CardTitle>
          <CardDescription>
            {effectiveMode === 'indexed'
              ? `Each line rebased to 100 at its own first observation${windowFirst && windowLast ? ` · window ${windowFirst} → ${windowLast}` : ''}.`
              : trendsOn
                ? '€/m² on the left axis · Google Trends score (0–100 baseline) on the right.'
                : '€/m² on the left axis · monthly overnights on the right.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasPriceData ? (
            <ChartPlaceholder>Loading property data…</ChartPlaceholder>
          ) : isLoadingTrends || isLoadingDormidas ? (
            <ChartPlaceholder>
              Loading {isLoadingTrends ? 'Google Trends' : 'INE dormidas'}…
            </ChartPlaceholder>
          ) : fetchError ? (
            <ChartPlaceholder tone="error">Failed to load — {fetchError}</ChartPlaceholder>
          ) : points.length === 0 ? (
            <ChartPlaceholder>No overlapping months between the active series.</ChartPlaceholder>
          ) : (
            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                  <defs>
                    <linearGradient id="signalsBg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={isDark ? '#0f172a' : '#f8fafc'} stopOpacity={0} />
                      <stop offset="100%" stopColor={isDark ? '#0f172a' : '#f8fafc'} stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
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
                      <YAxis
                        yAxisId="signal"
                        orientation="right"
                        tickFormatter={v => trendsOn ? Math.round(v).toString() : fmtBigInt(v)}
                        tick={{ fill: trendsOn ? TRENDS_COLOR : DORMIDAS_COLOR, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={48}
                      />
                    </>
                  )}

                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                      borderRadius: '10px',
                      color: isDark ? '#f1f5f9' : '#0f172a',
                      fontSize: '12px',
                      boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
                    }}
                    labelStyle={{ color: textColor, fontSize: '10px', marginBottom: '4px' }}
                    formatter={(value: any, name: any) => {
                      if (value == null) return ['—', name];
                      if (effectiveMode === 'indexed') return [fmtIdx(Number(value)), name];
                      if (name === priceLineLabel) return [fmtPrice(Number(value)), name];
                      if (name === trendsLineLabel) return [Math.round(Number(value)).toString(), name];
                      return [fmtBigInt(Number(value)), name];
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
                      {trendsOn && (
                        <Line
                          type="monotone" dataKey="trendsIdx" name={trendsLineLabel}
                          stroke={TRENDS_COLOR} strokeWidth={2} dot={false}
                          activeDot={{ r: 4 }} connectNulls
                        />
                      )}
                      {dormidasOn && (
                        <Line
                          type="monotone" dataKey="dormidasIdx" name={dormidasLineLabel}
                          stroke={DORMIDAS_COLOR} strokeWidth={2} dot={false}
                          activeDot={{ r: 4 }} connectNulls
                        />
                      )}
                    </>
                  ) : (
                    <>
                      <Line
                        yAxisId="price" type="monotone" dataKey="price" name={priceLineLabel}
                        stroke={PRICE_COLOR} strokeWidth={2.25} dot={false}
                        activeDot={{ r: 4 }} connectNulls
                      />
                      {trendsOn && (
                        <Line
                          yAxisId="signal" type="monotone" dataKey="trends" name={trendsLineLabel}
                          stroke={TRENDS_COLOR} strokeWidth={2} dot={false}
                          activeDot={{ r: 4 }} connectNulls
                        />
                      )}
                      {dormidasOn && (
                        <Line
                          yAxisId="signal" type="monotone" dataKey="dormidas" name={dormidasLineLabel}
                          stroke={DORMIDAS_COLOR} strokeWidth={2} dot={false}
                          activeDot={{ r: 4 }} connectNulls
                        />
                      )}
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <p className="mt-3 text-[10px] text-muted-foreground leading-relaxed">
            Price: weighted €/m² across the {priceScopeLabel} listings.
            {trendsOn && (
              <> Search interest: weekly Google Trends score for the keyword{' '}
                <span className="font-medium">Lisbon</span>, averaged to monthly values.</>
            )}
            {dormidasOn && (
              <> Overnights: INE monthly figures
                {dormidasMuni === ALL_AML_OPTION ? ' for the AML aggregate.' : ` for ${dormidasMuni}.`}</>
            )}
            {effectiveMode === 'indexed' && ' Indexed view rebases each line to 100 at its own first observation, so series with different start dates remain directly comparable.'}
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

function ToolbarDivider() {
  return <span aria-hidden className="hidden h-5 w-px bg-border/60 lg:block" />;
}

function SignalChip({
  label, icon: Icon, color, active, onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-all',
        active
          ? 'border-transparent bg-foreground/[0.06] text-foreground shadow-sm ring-1 ring-border/60'
          : 'border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
      )}
      style={active ? { boxShadow: `inset 0 0 0 1px ${color}30` } : undefined}
    >
      <span
        className="h-1.5 w-1.5 rounded-full transition-opacity"
        style={{ backgroundColor: color, opacity: active ? 1 : 0.35 }}
      />
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function KpiCard({
  label, icon: Icon, color, value, tone, range,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  value: string;
  tone: 'pos' | 'neg' | 'neutral';
  range?: string | null;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon className="h-3 w-3" style={{ color }} />
          {label}
        </div>
        <div
          className={cn(
            'mt-1 text-xl font-semibold tabular-nums',
            tone === 'pos' && 'text-emerald-600 dark:text-emerald-400',
            tone === 'neg' && 'text-rose-600 dark:text-rose-400',
          )}
        >
          {value}
        </div>
        {range && (
          <div className="mt-0.5 text-[10px] text-muted-foreground/80 tabular-nums">
            {range}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CorrRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-base font-semibold tabular-nums">{value.toFixed(2)}</span>
        <span className="text-[10px] text-muted-foreground">{describeCorrelation(value)}</span>
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
