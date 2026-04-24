import { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { LineChart as LineIcon, Inbox, Loader2 } from 'lucide-react';
import { useDashboard } from '@/context/DashboardContext';
import { aggregateByMonth } from '@/lib/dataUtils';
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

function formatXTick(mesAno: string): string {
  const [year, month] = mesAno.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[parseInt(month) - 1]} ${year.slice(2)}`;
}

function formatYValue(value: number, metric: 'avg_m2' | 'avg_preco', tipoVenda: 'compra' | 'arrendamento'): string {
  if (metric === 'avg_m2') return `€${Math.round(value).toLocaleString('pt-PT')}`;
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}K`;
  if (tipoVenda === 'arrendamento') return `€${Math.round(value)}`;
  return `€${Math.round(value).toLocaleString('pt-PT')}`;
}

const TICK_INTERVAL = 5;

export function PriceChart() {
  const { filteredData, tipoVenda, metric, setMetric, drilldown, isDrillLoading } = useDashboard();
  const isDark = useIsDark();

  const chartData = useMemo(
    () => aggregateByMonth(filteredData, metric),
    [filteredData, metric],
  );

  const tickFormatter = (_: string, index: number) => {
    if (index % TICK_INTERVAL !== 0) return '';
    return formatXTick(chartData[index]?.mes_ano ?? '');
  };

  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';
  const lineColor = tipoVenda === 'compra' ? '#6366f1' : '#10b981';

  const subtitle = drilldown.freguesia
    ? `${drilldown.freguesia}, ${drilldown.municipio}`
    : drilldown.municipio
      ? drilldown.municipio
      : 'All Lisboa District';

  const isEmpty = chartData.length === 0 || chartData.every(p => p.value === 0);

  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-5 backdrop-blur-sm dark:bg-card/40">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
            <LineIcon className="h-3 w-3" />
            Price Trend
          </div>
          <div className="mt-1 text-base font-semibold">{subtitle}</div>
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
        <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin opacity-60" />
          <div className="text-xs">Fetching time series…</div>
        </div>
      ) : isEmpty ? (
        <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-muted-foreground">
          <Inbox className="h-6 w-6 opacity-40" />
          <div className="text-sm font-medium">Not enough data for this selection</div>
          <div className="text-xs">Try clearing the filter or switching market type.</div>
        </div>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
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
                tickFormatter={v => formatYValue(v, metric, tipoVenda)}
                tick={{ fill: textColor, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={68}
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
                formatter={(value: any) => [
                  formatYValue(value, metric, tipoVenda),
                  metric === 'avg_m2'
                    ? tipoVenda === 'compra' ? 'Price/m²' : 'Rent/m²/mo'
                    : 'Avg Price',
                ]}
                labelFormatter={label => {
                  const [y, m] = label.split('-');
                  return new Date(parseInt(y), parseInt(m) - 1)
                    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
