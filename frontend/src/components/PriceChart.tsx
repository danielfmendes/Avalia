import { useEffect, useMemo, useState, useCallback } from 'react';
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
  ReferenceArea,
  ReferenceDot,
} from 'recharts';
import { LineChart as LineIcon, Inbox, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
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

function fmtLabel(mesAno: string): string {
  const [year, month] = mesAno.split('-');
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${mon[parseInt(month) - 1]} '${year.slice(2)}`;
}

function fmtFull(mesAno: string): string {
  const [year, month] = mesAno.split('-');
  const mon = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${mon[parseInt(month) - 1]} ${year}`;
}

function fmtPrice(v: number, metric: 'avg_m2' | 'avg_preco', tipo: string): string {
  if (metric === 'avg_m2') return `€${Math.round(v).toLocaleString('en-US')}`;
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `€${(v / 1_000).toFixed(0)}K`;
  if (tipo === 'arrendamento') return `€${Math.round(v)}`;
  return `€${Math.round(v).toLocaleString('en-US')}`;
}

// Compute a clean tick interval so we never show more than ~7 x-axis labels.
function smartInterval(count: number): number {
  if (count <= 12) return 1;
  if (count <= 24) return 3;
  if (count <= 60) return 6;
  if (count <= 120) return 12;
  return 24;
}

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

// Invisible tooltip — we only want the built-in cursor line, not the popup box.
function NullTooltip() { return null; }

export function PriceChart() {
  const {
    filteredData, districtData, tipoVenda, metric, setMetric, drilldown, isDrillLoading,
  } = useDashboard();
  const isDark = useIsDark();

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);

  // One-frame mount delay so ResponsiveContainer doesn't warn about width(-1)
  // on the first paint when the parent flex cell hasn't been measured yet.
  const [chartReady, setChartReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setChartReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const chartData = useMemo<MergedPoint[]>(() => {
    const price = aggregateByMonth(filteredData, metric);
    const vol = volumeByMonth(filteredData);
    return price.map(p => ({ mes_ano: p.mes_ano, price: p.value, volume: vol.get(p.mes_ano) ?? 0 }));
  }, [filteredData, metric]);

  // Reset hover and anchor when data changes (new drill, new filter, etc.)
  useEffect(() => { setHoverIndex(null); setAnchorIndex(null); }, [chartData]);

  const districtAvg = useMemo(() => {
    const baseline = filterRecords(districtData, tipoVenda, null, null);
    const agg = aggregateByMonth(baseline, metric);
    if (agg.length === 0) return null;
    const vals = agg.map(p => p.value).filter(v => v > 0);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  }, [districtData, tipoVenda, metric]);

  const isEmpty = chartData.length === 0 || chartData.every(p => p.price === 0);

  // ── Interactive header stats (Apple Stocks style) ──────────────────────────
  const firstPoint = chartData[0] ?? null;
  const lastPoint  = chartData[chartData.length - 1] ?? null;
  const activePoint = hoverIndex !== null ? (chartData[hoverIndex] ?? null) : lastPoint;

  // When an anchor is set (mousedown), show change relative to that anchor point.
  const rangeStart = anchorIndex !== null ? (chartData[anchorIndex] ?? firstPoint) : firstPoint;
  const isAnchored = anchorIndex !== null;

  const priceAbs = rangeStart && activePoint
    ? activePoint.price - rangeStart.price
    : null;
  const pricePct = rangeStart && activePoint && rangeStart.price > 0
    ? ((activePoint.price - rangeStart.price) / rangeStart.price) * 100
    : null;
  const isUp = priceAbs !== null && priceAbs >= 0;

  const deltaToDistrict = useMemo(() => {
    if (!districtAvg || !lastPoint || lastPoint.price <= 0) return null;
    return ((lastPoint.price - districtAvg) / districtAvg) * 100;
  }, [lastPoint, districtAvg]);

  const showRefLine = !!drilldown.municipio && districtAvg !== null && !isEmpty;
  const scope       = drilldown.freguesia
    ? `${drilldown.freguesia}, ${drilldown.municipio}`
    : drilldown.municipio ?? 'All Lisboa District';

  // ── X-axis smart ticks ─────────────────────────────────────────────────────
  const interval = smartInterval(chartData.length);
  const xTicks = useMemo(
    () => chartData.filter((_, i) => i % interval === 0).map(d => d.mes_ano),
    [chartData, interval],
  );
  // Show only the year when ticks are ≥12 months apart (no duplicate-year risk).
  const xTickFmt = useCallback(
    (val: string) => interval >= 12 ? val.split('-')[0] : fmtLabel(val),
    [interval],
  );

  const gridColor   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor   = isDark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.38)';
  const lineColor   = tipoVenda === 'compra' ? '#6366f1' : '#10b981';
  const volumeColor = isDark ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.45)';
  const cursorColor = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)';

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-5 pb-4 backdrop-blur-sm dark:bg-card/40">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
            <LineIcon className="h-3 w-3 shrink-0" />
            Price · Volume Trend
          </div>

          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold truncate">{scope}</span>

            {/* Hovered / latest month label */}
            {!isEmpty && activePoint && (
              <span className="text-xs text-muted-foreground">
                {isAnchored && hoverIndex !== null
                  ? `${fmtFull(rangeStart!.mes_ano)} → ${fmtFull(activePoint.mes_ano)}`
                  : hoverIndex !== null
                    ? fmtFull(activePoint.mes_ano)
                    : firstPoint && lastPoint && firstPoint.mes_ano !== lastPoint.mes_ano
                      ? `${fmtLabel(firstPoint.mes_ano)} – ${fmtLabel(lastPoint.mes_ano)}`
                      : fmtLabel(lastPoint?.mes_ano ?? '')
                }
              </span>
            )}
          </div>

          {/* Apple-Stocks interactive price + change ─────────────────────── */}
          {!isEmpty && activePoint && (
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
              <span className="text-2xl font-bold tabular-nums tracking-tight">
                {fmtPrice(activePoint.price, metric, tipoVenda)}
                {metric === 'avg_m2' && (
                  <span className="ml-0.5 text-sm font-normal text-muted-foreground">/m²</span>
                )}
              </span>

              {priceAbs !== null && pricePct !== null && (rangeStart?.price ?? 0) > 0 && (
                <span className={cn(
                  'flex items-center gap-0.5 text-sm font-semibold tabular-nums',
                  isUp ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400',
                )}>
                  {isUp
                    ? <ArrowUpRight className="h-3.5 w-3.5" />
                    : <ArrowDownRight className="h-3.5 w-3.5" />}
                  {isUp ? '+' : ''}{fmtPrice(priceAbs, metric, tipoVenda)}
                  <span className="text-xs font-normal opacity-70">
                    &nbsp;({isUp ? '+' : ''}{pricePct.toFixed(1)}%)
                  </span>
                </span>
              )}

              {deltaToDistrict !== null && drilldown.municipio && hoverIndex === null && (
                <span className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                  deltaToDistrict >= 0
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                )}>
                  {deltaToDistrict >= 0 ? '+' : ''}{deltaToDistrict.toFixed(1)}% vs district
                </span>
              )}
            </div>
          )}
        </div>

        {/* Metric toggle */}
        <div className="shrink-0 flex rounded-full border border-border/60 bg-muted/30 p-0.5">
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

      {/* ── Chart body — grows to fill the card ──────────────────────────── */}
      {isEmpty && isDrillLoading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin opacity-60" />
          <div className="text-xs">Fetching time series…</div>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Inbox className="h-6 w-6 opacity-40" />
          <div className="text-sm font-medium">Not enough data for this selection</div>
          <div className="text-xs">Try clearing the filter or switching market type.</div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 w-full">
            {chartReady && (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                onMouseMove={(data: any) => {
                  if (data?.isTooltipActive && data.activeTooltipIndex !== undefined) {
                    setHoverIndex(data.activeTooltipIndex as number);
                  }
                }}
                onMouseLeave={() => { setHoverIndex(null); setAnchorIndex(null); }}
                onMouseDown={(data: any) => {
                  if (data?.activeTooltipIndex !== undefined) {
                    setAnchorIndex(data.activeTooltipIndex as number);
                  }
                }}
                onMouseUp={() => setAnchorIndex(null)}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />

                <XAxis
                  dataKey="mes_ano"
                  ticks={xTicks}
                  tickFormatter={xTickFmt}
                  tick={{ fill: textColor, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />

                <YAxis
                  yAxisId="price"
                  tickFormatter={v => fmtPrice(v, metric, tipoVenda)}
                  tick={{ fill: textColor, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                />
                <YAxis
                  yAxisId="volume"
                  orientation="right"
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
                  tick={{ fill: textColor, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />

                {/* Invisible tooltip — gives us the cursor line & onMouseMove events */}
                <Tooltip
                  content={<NullTooltip />}
                  cursor={{ stroke: cursorColor, strokeWidth: 1.5 }}
                />

                <Bar
                  yAxisId="volume"
                  dataKey="volume"
                  fill={volumeColor}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={8}
                  isAnimationActive={false}
                />

                {showRefLine && districtAvg !== null && (
                  <ReferenceLine
                    yAxisId="price"
                    y={districtAvg}
                    stroke={isDark ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.28)'}
                    strokeDasharray="4 4"
                    label={{
                      value: 'District avg',
                      position: 'insideTopRight',
                      fill: textColor,
                      fontSize: 9,
                    }}
                  />
                )}

                {/* Apple-Stocks-style click-drag highlight: shaded band between
                    anchor (mousedown) and current hover, tinted by direction. */}
                {isAnchored
                  && anchorIndex !== null
                  && hoverIndex !== null
                  && chartData[anchorIndex]
                  && chartData[hoverIndex]
                  && anchorIndex !== hoverIndex && (
                  <ReferenceArea
                    yAxisId="price"
                    x1={chartData[Math.min(anchorIndex, hoverIndex)].mes_ano}
                    x2={chartData[Math.max(anchorIndex, hoverIndex)].mes_ano}
                    fill={isUp ? '#10b981' : '#f43f5e'}
                    fillOpacity={0.10}
                    stroke="none"
                  />
                )}

                {/* Solid colored vertical line + dot at the anchor */}
                {isAnchored && anchorIndex !== null && chartData[anchorIndex] && (
                  <>
                    <ReferenceLine
                      yAxisId="price"
                      x={chartData[anchorIndex].mes_ano}
                      stroke={isUp ? '#10b981' : '#f43f5e'}
                      strokeWidth={1.5}
                      strokeOpacity={0.85}
                    />
                    <ReferenceDot
                      yAxisId="price"
                      x={chartData[anchorIndex].mes_ano}
                      y={chartData[anchorIndex].price}
                      r={4}
                      fill={isUp ? '#10b981' : '#f43f5e'}
                      stroke={isDark ? '#0f172a' : '#ffffff'}
                      strokeWidth={2}
                    />
                  </>
                )}

                {/* And a matching colored line at the current hover position */}
                {isAnchored
                  && hoverIndex !== null
                  && chartData[hoverIndex]
                  && hoverIndex !== anchorIndex && (
                  <ReferenceLine
                    yAxisId="price"
                    x={chartData[hoverIndex].mes_ano}
                    stroke={isUp ? '#10b981' : '#f43f5e'}
                    strokeWidth={1.5}
                    strokeOpacity={0.85}
                  />
                )}

                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="price"
                  stroke={lineColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: lineColor,
                    stroke: isDark ? '#0f172a' : '#ffffff',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
            )}
          </div>

          {/* Legend */}
          <div className="mt-2 shrink-0 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: lineColor }} />
              Price
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2 rounded-sm" style={{ backgroundColor: volumeColor }} />
              Volume
            </span>
            {showRefLine && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 border-t border-dashed border-muted-foreground/50" />
                District avg
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
