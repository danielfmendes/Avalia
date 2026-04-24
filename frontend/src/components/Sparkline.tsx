import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface SparklineProps {
  data: Array<{ value: number }>;
  color?: string;
  height?: number;
  fill?: boolean;
}

// Minimal sparkline — no axes, no tooltips, no legend. Shows the shape of
// recent values at a glance. Silent on empty / single-point series.
export function Sparkline({
  data,
  color = '#6366f1',
  height = 36,
  fill = true,
}: SparklineProps) {
  if (!data || data.length < 2) {
    return <div style={{ height }} />;
  }
  const gradId = `spark-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={fill ? `url(#${gradId})` : 'none'}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
