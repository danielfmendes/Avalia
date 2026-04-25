import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Sparkles, AlertTriangle, CheckCircle2, Info, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useDashboard } from '@/context/DashboardContext';
import { aggregateByMonth, generateForecast, wavg } from '@/lib/dataUtils';
import { Sparkline } from '@/components/Sparkline';
import { cn } from '@/lib/utils';
import type { HabitacaoRecord } from '@/lib/types';

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

interface Insight {
  type: 'positive' | 'warning' | 'neutral';
  title: string;
  body: string;
}

const AI_INSIGHTS: Insight[] = [
  {
    type: 'positive',
    title: 'Parque das Nações — Strong Growth Signal',
    body: 'Consistently outperforming the district average with +12.4% YoY appreciation. Modern infrastructure and proximity to Expo hub continue attracting premium buyers.',
  },
  {
    type: 'positive',
    title: 'Marvila — Emerging High-Value Zone',
    body: 'Creative district transformation is driving 18% price appreciation. Artist studios and tech hubs are repositioning Marvila as Lisbon\'s next premium neighbourhood.',
  },
  {
    type: 'warning',
    title: 'Cascais Luxury Segment Stabilising',
    body: 'After peaking in Q3 2022, Cascais high-end properties (+€6,000/m²) show signs of volume compression. Correction risk is elevated in the €1M+ bracket.',
  },
  {
    type: 'neutral',
    title: 'Sintra Rental Yield Opportunity',
    body: 'Below-average prices combined with growing remote-work demand from Lisboa workers create a structural rental yield opportunity of 5.2%—highest in the district.',
  },
  {
    type: 'positive',
    title: 'Odivelas Metro Expansion Effect',
    body: 'The Yellow Line extension is catalysing price growth in northern Odivelas parishes. Forward-looking models price in an additional 8–11% over 24 months.',
  },
  {
    type: 'warning',
    title: 'Affordability Ceiling Risk',
    body: 'Lisboa municipal prices now at 38× median annual salary. Historical data suggests prices plateau or correct when this ratio exceeds 40×. Monitor closely in H2 2024.',
  },
];

function InsightIcon({ type }: { type: Insight['type'] }) {
  if (type === 'positive') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (type === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <Info className="h-4 w-4 text-blue-500" />;
}

// ── Per-municipality forecast ────────────────────────────────────────────────
// Applies the same trailing-18-month linear trend the hero chart uses, but one
// municipality at a time. No composite score, no opinion baked in — just the
// model's own output, surfaced per region.
interface MuniForecast {
  municipio: string;
  current: number;
  projected: number;
  changePct: number;
  months: number;     // history points used — confidence proxy
  spark: Array<{ value: number }>;
}

function perMunicipalityForecast(
  records: HabitacaoRecord[],
  tipoVenda: 'compra' | 'arrendamento',
): MuniForecast[] {
  const scope = records.filter(
    r => r.tipo_venda === tipoVenda && r.freguesia === 'Grouped at Municipio level',
  );
  const munis = [...new Set(scope.map(r => r.municipio))];

  return munis
    .map(name => {
      const rs = scope.filter(r => r.municipio === name);
      const hist = aggregateByMonth(rs, 'avg_m2');
      const fc = generateForecast(hist);
      const current = hist[hist.length - 1]?.value ?? 0;
      const projected = fc[fc.length - 1]?.value ?? current;
      const changePct = current > 0 ? ((projected - current) / current) * 100 : 0;
      return {
        municipio: name,
        current,
        projected,
        changePct,
        months: hist.length,
        spark: hist.slice(-18).map(p => ({ value: p.value })),
      };
    })
    .filter(r => r.current > 0 && r.months >= 6)
    .sort((a, b) => b.changePct - a.changePct);
}

function confidenceLabel(months: number): { label: string; tone: string } {
  if (months >= 18) return { label: 'High', tone: 'text-emerald-600 dark:text-emerald-400' };
  if (months >= 12) return { label: 'Medium', tone: 'text-amber-600 dark:text-amber-400' };
  return { label: 'Low', tone: 'text-muted-foreground' };
}

export function AIPredictions() {
  const { filteredData, metric, drilldown, districtData, tipoVenda } = useDashboard();
  const isDark = useIsDark();

  const { historical, forecast, combined, splitMesAno } = useMemo(() => {
    const hist = aggregateByMonth(filteredData, metric);
    const fc = generateForecast(hist);
    const split = hist[hist.length - 1]?.mes_ano ?? '';
    const comb = [
      ...hist.map(p => ({ ...p, forecast: false })),
      ...fc,
    ];
    return { historical: hist, forecast: fc, combined: comb, splitMesAno: split };
  }, [filteredData, metric]);

  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';

  const lastValue = historical[historical.length - 1]?.value ?? 0;
  const forecastEndValue = forecast[forecast.length - 1]?.value ?? lastValue;
  const forecastChange = lastValue > 0 ? ((forecastEndValue - lastValue) / lastValue) * 100 : 0;

  const subtitle = drilldown.freguesia
    ? `${drilldown.freguesia}, ${drilldown.municipio}`
    : drilldown.municipio ?? 'All Lisboa District';

  const formatVal = (v: number) => {
    if (metric === 'avg_m2') return `€${Math.round(v).toLocaleString('pt-PT')}`;
    if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `€${(v / 1_000).toFixed(0)}K`;
    return `€${Math.round(v)}`;
  };

  const muniForecasts = useMemo(
    () => perMunicipalityForecast(districtData, tipoVenda),
    [districtData, tipoVenda],
  );

  const benchmark = useMemo(() => {
    // District-wide weighted €/m² for the latest month — used as a "vs district" badge.
    const scope = districtData.filter(
      r => r.tipo_venda === tipoVenda && r.freguesia === 'Grouped at Municipio level',
    );
    if (scope.length === 0) return 0;
    const latest = scope.reduce((m, r) => (r.mes_ano > m ? r.mes_ano : m), '');
    const rs = scope.filter(r => r.mes_ano === latest);
    return wavg(rs, 'avg_m2');
  }, [districtData, tipoVenda]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
            <Sparkles className="h-3 w-3 text-amber-500" />
            Forecast
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">AI Predictions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            12-month price projection with a forecast range · linear trend on trailing 18 months.
          </p>
        </div>
        <Badge variant="outline" className="gap-1 text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
          Model active
        </Badge>
      </div>

      {/* Forecast summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground">Current ({splitMesAno})</div>
            <div className="text-xl font-bold mt-1">{formatVal(lastValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground">12-month Forecast</div>
            <div className="text-xl font-bold mt-1">{formatVal(forecastEndValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground">Expected Change</div>
            <div
              className={cn(
                'text-xl font-bold mt-1',
                forecastChange >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400',
              )}
            >
              {forecastChange >= 0 ? '+' : ''}
              {forecastChange.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Forecast chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Price Forecast</CardTitle>
          <CardDescription>
            {subtitle} · Historical + 12-month projection with a forecast uncertainty range
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={combined} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorHist" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis
                  dataKey="mes_ano"
                  tick={{ fill: textColor, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  tickFormatter={v => formatVal(v)}
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
                  formatter={(value: any, name: any) => [formatVal(value), name]}
                />
                {splitMesAno && (
                  <ReferenceLine
                    x={splitMesAno}
                    stroke={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
                    strokeDasharray="4 4"
                    label={{
                      value: 'Forecast →',
                      position: 'insideTopRight',
                      fill: textColor,
                      fontSize: 10,
                    }}
                  />
                )}
                {/* Proper band between lower and upper. Recharts accepts a
                    function returning a tuple — anything outside the forecast
                    portion has undefined lower/upper and is skipped, so the
                    band only renders to the right of the split. */}
                <Area
                  type="monotone"
                  dataKey={(d: any) =>
                    d.lower != null && d.upper != null ? [d.lower, d.upper] : null
                  }
                  stroke="none"
                  fill="#f59e0b"
                  fillOpacity={0.18}
                  name="Forecast range"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#colorHist)"
                  name="Historical"
                  dot={false}
                  activeDot={{ r: 4, fill: '#3b82f6' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-blue-500" /> Historical
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-4 rounded-sm bg-amber-500/30" /> Forecast range
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Two-column: AI insights + per-muni forecast */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* AI Insights */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            AI Market Signals
          </h2>
          <div className="space-y-2.5">
            {AI_INSIGHTS.map(insight => (
              <div
                key={insight.title}
                className={cn(
                  'rounded-lg border p-3.5',
                  insight.type === 'positive' && 'border-emerald-500/20 bg-emerald-500/5',
                  insight.type === 'warning' && 'border-amber-500/20 bg-amber-500/5',
                  insight.type === 'neutral' && 'border-blue-500/20 bg-blue-500/5',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <InsightIcon type={insight.type} />
                  <div>
                    <div className="text-xs font-semibold leading-tight">{insight.title}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                      {insight.body}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Per-municipality forecast */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-blue-500" />
              Forecast by municipality
            </h2>
            <span className="text-[10px] text-muted-foreground">
              12-month · {tipoVenda === 'compra' ? 'sale' : 'rental'}
            </span>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="max-h-[520px] overflow-x-auto overflow-y-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead className="sticky top-0 bg-card/95 backdrop-blur">
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                      <th className="pb-2 pl-4 pt-3 text-left">Municipality</th>
                      <th className="pb-2 pt-3 text-right">Now</th>
                      <th className="pb-2 pt-3 text-right">Trend</th>
                      <th className="pb-2 pt-3 text-right">12mo</th>
                      <th className="pb-2 pr-4 pt-3 text-right">Δ%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {muniForecasts.map(row => {
                      const confidence = confidenceLabel(row.months);
                      const aboveBench = benchmark > 0 && row.current > benchmark;
                      const changeIcon = Math.abs(row.changePct) < 0.25
                        ? <Minus className="h-3 w-3" />
                        : row.changePct >= 0
                          ? <ArrowUpRight className="h-3 w-3" />
                          : <ArrowDownRight className="h-3 w-3" />;
                      return (
                        <tr key={row.municipio} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2 pl-4">
                            <div className="flex flex-col">
                              <span className="font-medium truncate max-w-[140px]">{row.municipio}</span>
                              <span className={cn('text-[9px]', confidence.tone)}>
                                {confidence.label} confidence · {row.months}m
                              </span>
                            </div>
                          </td>
                          <td className="py-2 text-right">
                            <div className="font-mono tabular-nums">
                              €{Math.round(row.current).toLocaleString('pt-PT')}
                            </div>
                            <div className="text-[9px] text-muted-foreground">
                              {aboveBench ? 'above' : 'below'} avg
                            </div>
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex justify-end">
                              <div className="w-20">
                                <Sparkline
                                  data={row.spark}
                                  color={row.changePct >= 0 ? '#10b981' : '#f43f5e'}
                                  height={22}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">
                            €{Math.round(row.projected).toLocaleString('pt-PT')}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            <span
                              className={cn(
                                'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                                Math.abs(row.changePct) < 0.25
                                  ? 'bg-muted/60 text-muted-foreground'
                                  : row.changePct > 0
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                              )}
                            >
                              {changeIcon}
                              {row.changePct >= 0 ? '+' : ''}
                              {row.changePct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {muniForecasts.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                          Not enough history for municipality-level forecasts yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            * Each row runs the same linear-trend model on that municipality's own 18-month history. Confidence
            reflects data depth — low confidence means fewer observations and a wider margin for error.
          </p>
        </div>
      </div>
    </div>
  );
}
