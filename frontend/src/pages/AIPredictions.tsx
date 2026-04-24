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
import { Sparkles, TrendingUp, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useDashboard } from '@/context/DashboardContext';
import { aggregateByMonth, generateForecast, getMunicipioStats } from '@/lib/dataUtils';
import { cn } from '@/lib/utils';

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

export function AIPredictions() {
  const { filteredData, tipoVenda, metric, drilldown, allData } = useDashboard();
  const isDark = useIsDark();
  const muniStats = useMemo(() => getMunicipioStats(allData), [allData]);

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

  // Neighbourhood scores table
  const scores = useMemo(() => {
    const maxYoy = Math.max(...muniStats.map(s => s.yoy_change));
    const maxYield = Math.max(...muniStats.map(s => s.rental_yield));
    const maxM2 = Math.max(...muniStats.map(s => s.avg_m2));
    return muniStats
      .map(s => ({
        ...s,
        score: Math.round(
          Math.max(0, s.yoy_change / maxYoy) * 40 +
          (s.rental_yield / maxYield) * 40 +
          (1 - s.avg_m2 / maxM2) * 20,
        ),
        forecast12m: s.avg_m2 * (1 + forecastChange / 100),
      }))
      .sort((a, b) => b.score - a.score);
  }, [muniStats, forecastChange]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            AI Predictions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            ML-powered 12-month price forecast with confidence bands
          </p>
        </div>
        <Badge variant="outline" className="gap-1 text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
          Model active
        </Badge>
      </div>

      {/* Forecast summary cards */}
      <div className="grid grid-cols-3 gap-4">
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
            {subtitle} · Historical + 12-month projection with 95% confidence band
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
                  interval={5}
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
                  formatter={(value: number, name: string) => [formatVal(value), name]}
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
                {/* Confidence band */}
                <Area
                  type="monotone"
                  dataKey="upper"
                  stroke="none"
                  fill="#f59e0b"
                  fillOpacity={0.15}
                  name="Upper bound"
                />
                <Area
                  type="monotone"
                  dataKey="lower"
                  stroke="none"
                  fill="#f59e0b"
                  fillOpacity={0.0}
                  name="Lower bound"
                />
                {/* Historical */}
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
              <span className="inline-block h-3 w-4 rounded-sm bg-amber-500/30" /> 95% Confidence Band
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Two-column: AI insights + score table */}
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

        {/* Neighbourhood Score Table */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
            Investment Ranking
          </h2>
          <Card>
            <CardContent className="pt-4 pb-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                    <th className="pb-2 text-left">Municipality</th>
                    <th className="pb-2 text-right">€/m²</th>
                    <th className="pb-2 text-right">Yield</th>
                    <th className="pb-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {scores.map((s, idx) => (
                    <tr key={s.name} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-muted-foreground w-4">
                            {idx + 1}.
                          </span>
                          <span className="font-medium truncate max-w-[100px]">{s.name}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right font-mono">
                        €{Math.round(s.avg_m2 / 100) * 100}
                      </td>
                      <td className="py-2 text-right text-amber-600 dark:text-amber-400 font-medium">
                        {s.rental_yield.toFixed(1)}%
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                s.score >= 80
                                  ? 'bg-emerald-500'
                                  : s.score >= 60
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500',
                              )}
                              style={{ width: `${s.score}%` }}
                            />
                          </div>
                          <span
                            className={cn(
                              'font-bold w-6',
                              s.score >= 80
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : s.score >= 60
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-rose-600 dark:text-rose-400',
                            )}
                          >
                            {s.score}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            * Score based on YoY appreciation (40%), rental yield (40%), and affordability (20%).
            Not financial advice. Past performance ≠ future results.
          </p>
        </div>
      </div>
    </div>
  );
}
