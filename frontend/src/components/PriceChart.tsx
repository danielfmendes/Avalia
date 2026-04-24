import { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  // Show label every 6 months
  return monthNames[parseInt(month) - 1] + ' ' + year.slice(2);
}

function formatYValue(value: number, metric: 'avg_m2' | 'avg_preco', tipoVenda: 'compra' | 'arrendamento'): string {
  if (metric === 'avg_m2') {
    return `€${Math.round(value).toLocaleString('pt-PT')}`;
  }
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}K`;
  if (tipoVenda === 'arrendamento') return `€${Math.round(value)}`;
  return `€${Math.round(value).toLocaleString('pt-PT')}`;
}

const TICK_INTERVAL = 5;

export function PriceChart() {
  const { filteredData, tipoVenda, metric, setTipoVenda, setMetric, drilldown } = useDashboard();
  const isDark = useIsDark();

  const chartData = useMemo(
    () => aggregateByMonth(filteredData, metric),
    [filteredData, metric],
  );

  // Only show every Nth tick label to avoid crowding
  const tickFormatter = (_: string, index: number) => {
    if (index % TICK_INTERVAL !== 0) return '';
    return formatXTick(chartData[index]?.mes_ano ?? '');
  };

  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';
  const lineColor = tipoVenda === 'compra' ? '#3b82f6' : '#10b981';

  const subtitle = drilldown.freguesia
    ? `${drilldown.freguesia}, ${drilldown.municipio}`
    : drilldown.municipio
      ? drilldown.municipio
      : 'All Lisboa District';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Price Trend</CardTitle>
            <CardDescription className="mt-0.5">{subtitle}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Tipo venda toggle */}
            <div className="flex rounded-lg border p-1 gap-1">
              {(['compra', 'arrendamento'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTipoVenda(t)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors capitalize',
                    tipoVenda === t
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {/* Metric toggle */}
            <div className="flex rounded-lg border p-1 gap-1">
              {([
                { key: 'avg_m2', label: '€/m²' },
                { key: 'avg_preco', label: 'Avg Price' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setMetric(key)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    metric === key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="mes_ano"
                tickFormatter={tickFormatter}
                tick={{ fill: textColor, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={v => formatYValue(v, metric, tipoVenda)}
                tick={{ fill: textColor, fontSize: 11 }}
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
                formatter={(value: any) => [
                  formatYValue(value, metric, tipoVenda),
                  metric === 'avg_m2' ? (tipoVenda === 'compra' ? 'Price/m²' : 'Rent/m²/mo') : 'Avg Price',
                ]}
                labelFormatter={label => {
                  const [y, m] = label.split('-');
                  const month = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                  return month;
                }}
              />
              <Legend
                formatter={v => (
                  <span style={{ color: textColor, fontSize: '11px' }}>
                    {v}
                  </span>
                )}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                name={metric === 'avg_m2' ? (tipoVenda === 'compra' ? 'Price/m²' : 'Rent/m²/mo') : 'Avg Price'}
                activeDot={{ r: 4, fill: lineColor }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
