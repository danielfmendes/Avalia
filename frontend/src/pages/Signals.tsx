import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Activity, Search, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useDashboard } from '@/context/DashboardContext';
import { cn } from '@/lib/utils';

interface TrendPoint {
  date: string;   // "YYYY-MM-DD" (weekly)
  Lisbon: number; // Google Trends score (0–100+)
}

interface MergedPoint {
  mes_ano: string;
  price: number | null;
  trends: number | null;
  priceIdx: number | null;
  trendsIdx: number | null;
}

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

export function Signals() {
  const { districtData, tipoVenda } = useDashboard();
  const isDark = useIsDark();

  const [rawTrends, setRawTrends] = useState<TrendPoint[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [mode, setMode] = useState<'raw' | 'indexed'>('indexed');

  useEffect(() => {
    let cancelled = false;
    fetch('/data/google-trends.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: TrendPoint[]) => {
        if (!cancelled) setRawTrends(json);
      })
      .catch(err => {
        if (!cancelled) setFetchError((err as Error).message);
      });
    return () => { cancelled = true; };
  }, []);

  // Lisbon €/m² time series — weighted average across all Lisboa rows per month.
  const priceSeries = useMemo<Array<{ mes_ano: string; value: number }>>(() => {
    const scope = districtData.filter(
      r => r.tipo_venda === tipoVenda && r.municipio === 'Lisboa',
    );
    const map = new Map<string, { w: number; tot: number }>();
    for (const r of scope) {
      const cur = map.get(r.mes_ano) ?? { w: 0, tot: 0 };
      map.set(r.mes_ano, {
        w: cur.w + r.avg_m2 * r.total_rows,
        tot: cur.tot + r.total_rows,
      });
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes_ano, { w, tot }]) => ({
        mes_ano,
        value: tot > 0 ? w / tot : 0,
      }))
      .filter(p => p.value > 0);
  }, [districtData, tipoVenda]);

  // Monthly average of the weekly Google Trends series.
  const trendsMonthly = useMemo<Array<{ mes_ano: string; value: number }>>(() => {
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

  // Merge on month, keeping the overlapping window and indexing both to 100
  // at the first month where we have both series.
  const { merged, firstMonth, lastMonth, priceChange, trendsChange, correlation } = useMemo(() => {
    const priceMap = new Map(priceSeries.map(p => [p.mes_ano, p.value]));
    const trendsMap = new Map(trendsMonthly.map(p => [p.mes_ano, p.value]));
    const months = [...new Set([...priceMap.keys(), ...trendsMap.keys()])].sort();

    // First month where both exist — used as the indexing basis.
    const firstCommon = months.find(m => priceMap.has(m) && trendsMap.has(m)) ?? null;
    const lastCommon = [...months].reverse().find(m => priceMap.has(m) && trendsMap.has(m)) ?? null;

    const basePrice = firstCommon ? priceMap.get(firstCommon)! : 0;
    const baseTrends = firstCommon ? trendsMap.get(firstCommon)! : 0;

    const out: MergedPoint[] = months
      .filter(m => firstCommon && m >= firstCommon && lastCommon && m <= lastCommon)
      .map(mes_ano => {
        const price = priceMap.get(mes_ano) ?? null;
        const trends = trendsMap.get(mes_ano) ?? null;
        return {
          mes_ano,
          price,
          trends,
          priceIdx: price != null && basePrice > 0 ? (price / basePrice) * 100 : null,
          trendsIdx: trends != null && baseTrends > 0 ? (trends / baseTrends) * 100 : null,
        };
      });

    const priceVals: number[] = [];
    const trendsVals: number[] = [];
    for (const p of out) {
      if (p.price != null && p.trends != null) {
        priceVals.push(p.price);
        trendsVals.push(p.trends);
      }
    }
    const corr = pearson(priceVals, trendsVals);

    const lastPrice = [...out].reverse().find(p => p.price != null)?.price ?? basePrice;
    const lastTrends = [...out].reverse().find(p => p.trends != null)?.trends ?? baseTrends;
    const pChange = basePrice > 0 ? ((lastPrice - basePrice) / basePrice) * 100 : 0;
    const tChange = baseTrends > 0 ? ((lastTrends - baseTrends) / baseTrends) * 100 : 0;

    return {
      merged: out,
      firstMonth: firstCommon,
      lastMonth: lastCommon,
      priceChange: pChange,
      trendsChange: tChange,
      correlation: corr,
    };
  }, [priceSeries, trendsMonthly]);

  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';

  const priceColor = '#6366f1';   // indigo
  const trendsColor = '#f59e0b';  // amber

  const fmtPrice = (v: number) => `€${Math.round(v).toLocaleString('pt-PT')}`;
  const fmtIdx = (v: number) => `${v >= 100 ? '+' : ''}${(v - 100).toFixed(1)}%`;

  const hasPriceData = priceSeries.length > 0;
  const isLoadingTrends = rawTrends === null && fetchError === null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
            <Activity className="h-3 w-3 text-amber-500" />
            External signals
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Signals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare Lisbon {tipoVenda === 'compra' ? 'sale' : 'rental'} prices against Google Trends
            search interest for <span className="font-medium text-foreground">“Lisbon”</span>.
          </p>
        </div>

        <div className="inline-flex items-center gap-0.5 rounded-full border border-border/50 bg-muted/30 p-1">
          <button
            onClick={() => setMode('indexed')}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
              mode === 'indexed'
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Indexed
          </button>
          <button
            onClick={() => setMode('raw')}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
              mode === 'raw'
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Raw
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <TrendingUp className="h-3 w-3" style={{ color: priceColor }} />
              Price change ({firstMonth ?? '—'} → {lastMonth ?? '—'})
            </div>
            <div
              className={cn(
                'mt-1 text-xl font-semibold tabular-nums',
                priceChange >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400',
              )}
            >
              {priceChange >= 0 ? '+' : ''}
              {priceChange.toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Search className="h-3 w-3" style={{ color: trendsColor }} />
              Search interest change
            </div>
            <div
              className={cn(
                'mt-1 text-xl font-semibold tabular-nums',
                trendsChange >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400',
              )}
            >
              {trendsChange >= 0 ? '+' : ''}
              {trendsChange.toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Activity className="h-3 w-3 text-muted-foreground" />
              Correlation (Pearson)
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {correlation.toFixed(2)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {Math.abs(correlation) > 0.7
                ? 'Strong co-movement'
                : Math.abs(correlation) > 0.4
                  ? 'Moderate co-movement'
                  : 'Weak co-movement'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time plot */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Price vs. search interest over time</CardTitle>
          <CardDescription>
            {mode === 'indexed'
              ? `Both series indexed to 100 at ${firstMonth ?? '—'} — identical scale so relative growth is comparable.`
              : 'Raw €/m² on the left axis, Google Trends score (0–100 baseline) on the right.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasPriceData ? (
            <div className="flex h-[320px] items-center justify-center text-xs text-muted-foreground">
              Loading property data…
            </div>
          ) : isLoadingTrends ? (
            <div className="flex h-[320px] items-center justify-center text-xs text-muted-foreground">
              Loading Google Trends…
            </div>
          ) : fetchError ? (
            <div className="flex h-[320px] items-center justify-center text-xs text-rose-500">
              Failed to load google-trends.json — {fetchError}
            </div>
          ) : merged.length === 0 ? (
            <div className="flex h-[320px] items-center justify-center text-xs text-muted-foreground">
              No overlapping months between the two series.
            </div>
          ) : (
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={merged} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis
                    dataKey="mes_ano"
                    tick={{ fill: textColor, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval={Math.max(0, Math.floor(merged.length / 10))}
                  />

                  {mode === 'indexed' ? (
                    <YAxis
                      tickFormatter={v => `${Math.round(v - 100) >= 0 ? '+' : ''}${Math.round(v - 100)}%`}
                      tick={{ fill: textColor, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                    />
                  ) : (
                    <>
                      <YAxis
                        yAxisId="price"
                        orientation="left"
                        tickFormatter={v => `€${Math.round(v / 100) * 100}`}
                        tick={{ fill: priceColor, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={72}
                      />
                      <YAxis
                        yAxisId="trends"
                        orientation="right"
                        tickFormatter={v => `${Math.round(v)}`}
                        tick={{ fill: trendsColor, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                      />
                    </>
                  )}

                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#1e293b' : '#ffffff',
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                      borderRadius: '8px',
                      color: isDark ? '#f1f5f9' : '#0f172a',
                      fontSize: '12px',
                    }}
                    formatter={(value: any, name: any) => {
                      if (value == null) return ['—', name];
                      if (mode === 'indexed') return [fmtIdx(Number(value)), name];
                      if (name === 'Lisbon €/m²') return [fmtPrice(Number(value)), name];
                      return [Math.round(Number(value)).toString(), name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} iconType="plainline" />

                  {mode === 'indexed' ? (
                    <>
                      <Line
                        type="monotone"
                        dataKey="priceIdx"
                        name="Lisbon €/m²"
                        stroke={priceColor}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="trendsIdx"
                        name="Google Trends “Lisbon”"
                        stroke={trendsColor}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                    </>
                  ) : (
                    <>
                      <Line
                        yAxisId="price"
                        type="monotone"
                        dataKey="price"
                        name="Lisbon €/m²"
                        stroke={priceColor}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                      <Line
                        yAxisId="trends"
                        type="monotone"
                        dataKey="trends"
                        name="Google Trends “Lisbon”"
                        stroke={trendsColor}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <p className="mt-3 text-[10px] text-muted-foreground leading-relaxed">
            Price: weighted €/m² across Lisboa listings. Search interest: weekly Google Trends
            score for the keyword <span className="font-medium">Lisbon</span>, averaged to monthly
            values for alignment. Indexed view rebases both to 100 at the first shared month so
            relative growth is directly comparable.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
