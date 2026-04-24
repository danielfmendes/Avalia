import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { LineChart as LineIcon, Inbox, Loader2 } from 'lucide-react';
import { useDashboard } from '@/context/DashboardContext';
import { aggregateByMonth, filterRecords } from '@/lib/dataUtils';
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

function formatXTick(mesAno: string): string {
  const [year, month] = mesAno.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[parseInt(month) - 1]} ${year.slice(2)}`;
}

function formatPrice(v: number, metric: 'avg_m2' | 'avg_preco', tipo: string): string {
  if (metric === 'avg_m2') return `€${Math.round(v).toLocaleString('pt-PT')}`;
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `€${(v / 1_000).toFixed(0)}K`;
  if (tipo === 'arrendamento') return `€${Math.round(v)}`;
  return `€${Math.round(v).toLocaleString('pt-PT')}`;
}

const TICK_INTERVAL = 5;

interface MergedPoint {
  mes_ano: string;
  price: number;
  volume: number;
}

function volumeByMonth(records: HabitacaoRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of records) {
    map.set(r.mes_ano, (map.get(r.mes_ano) ?? 0) + r.total_rows);
  }
  return map;
}

export function PriceChart() {
  const {
    filteredData, districtData, tipoVenda, metric, setMetric, drilldown,
    isDrillLoading,
  } = useDashboard();
  const isDark = useIsDark();

  const chartData = useMemo<MergedPoint[]>(() => {
    const price = aggregateByMonth(filteredData, metric);
    const vol = volumeByMonth(filteredData);
    return price.map(p => ({
      mes_ano: p.mes_ano,
      price: p.value,
      volume: vol.get(p.mes_ano) ?? 0,
    }));
  }, [filteredData, metric]);

  // District-wide baseline for the selected metric / tipoVenda.
  // Computed from districtData so it's always available regardless of drill.
  const districtAvg = useMemo(() => {
    const baseline = filterRecords(districtData, tipoVenda, null, null);
    const agg = aggregateByMonth(baseline, metric);
    if (agg.length === 0) return null;
    const values = agg.map(p => p.value).filter(v => v > 0);
    if (values.length === 0) return null;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }, [districtData, tipoVenda, metric]);

  const tickFormatter = (_: string, index: number) => {
    if (index % TICK_INTERVAL !== 0) return '';
    return formatXTick(chartData[index]?.mes_ano ?? '');
  };

  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';
  const lineColor = tipoVenda === 'compra' ? '#6366f1' : '#10b981';
  const volumeColor = isDark ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.5)';

  const subtitle = drilldown.freguesia
    ? `${drilldown.freguesia}, ${drilldown.municipio}`
    : drilldown.municipio ?? 'All Lisboa District';

  const isEmpty = chartData.length === 0 || chartData.every(p => p.price === 0);

  // Relative to district baseline — appears in the subtitle as a quick read.
  const deltaToDistrict = useMemo(() => {
    if (!districtAvg || chartData.length === 0) return null;
    const latest = chartData[chartData.length - 1]?.price ?? 0;
    if (latest <= 0) return null;
    return ((latest - districtAvg) / districtAvg) * 100;
  }, [chartData, districtAvg]);

  const showReferenceLine = !!drilldown.municipio && districtAvg !== null && !isEmpty;

  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-5 backdrop-blur-sm dark:bg-card/40">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
            <LineIcon className="h-3 w-3" />
            Price · Volume Trend
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="text-base font-semibold">{subtitle}</div>
            {deltaToDistrict !== null && drilldown.municipio && (
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                  deltaToDistrict >= 0
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                )}
                title="Latest value vs. Lisboa district average"
              >
                {deltaToDistrict >= 0 ? '+' : ''}
                {deltaToDistrict.toFixed(1)}% vs district
              </span>
            )}
          </div>
        </div>

        <div className="flex rounded-full border border-border/60 bg-muted/30 p-0.5">
          {([
            { key: 'avg_m2', label: '€/m²' },
            { key: 'avg_preco', label: 'Avg Price' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              className={cn(
                'rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
                metric === key
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/40'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isEmpty && isDrillLoading ? (
        <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin opacity-60" />
          <div className="text-xs">Fetching time series…</div>
        </div>
      ) : isEmpty ? (
        <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-muted-foreground">
          <Inbox className="h-6 w-6 opacity-40" />
          <div className="text-sm font-medium">Not enough data for this selection</div>
          <div className="text-xs">Try clearing the filter or switching market type.</div>
        </div>
      ) : (
        <>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="priceLineFade" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis
                  dataKey="mes_ano"
                  tickFormatter={tickFormatter}
                  tick={{ fill: textColor, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="price"
                  tickFormatter={v => formatPrice(v, metric, tipoVenda)}
                  tick={{ fill: textColor, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={68}
                />
                <YAxis
                  yAxisId="volume"
                  orientation="right"
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`}
                  tick={{ fill: textColor, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  cursor={{ stroke: lineColor, strokeWidth: 1, strokeDasharray: '3 3' }}
                  contentStyle={{
                    backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.98)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                    borderRadius: '10px',
                    color: isDark ? '#f1f5f9' : '#0f172a',
                    fontSize: '11px',
                    boxShadow: '0 8px 24px -12px rgba(0,0,0,0.25)',
                  }}
                  formatter={(value: any, name: any) => {
                    if (name === 'price') {
                      return [formatPrice(value, metric, tipoVenda),
                        metric === 'avg_m2'
                          ? tipoVenda === 'compra' ? 'Price/m²' : 'Rent/m²/mo'
                          : 'Avg Price'];
                    }
                    if (name === 'volume') return [Math.round(value).toLocaleString('pt-PT'), 'Listings'];
                    return [value, name];
                  }}
                  labelFormatter={label => {
                    const [y, m] = label.split('-');
                    return new Date(parseInt(y), parseInt(m) - 1)
                      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                  }}
                />
                <Bar
                  yAxisId="volume"
                  dataKey="volume"
                  fill={volumeColor}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={10}
                  isAnimationActive={false}
                />
                {showReferenceLine && districtAvg !== null && (
                  <ReferenceLine
                    yAxisId="price"
                    y={districtAvg}
                    stroke={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'}
                    strokeDasharray="4 4"
                    label={{
                      value: 'District avg',
                      position: 'insideTopRight',
                      fill: textColor,
                      fontSize: 9,
                    }}
                  />
                )}
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="price"
                  stroke={lineColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ backgroundColor: lineColor }} />
              Price
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2 rounded-sm" style={{ backgroundColor: volumeColor }} />
              Listings volume
            </span>
            {showReferenceLine && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 border-t border-dashed border-muted-foreground/60" />
                District avg
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
