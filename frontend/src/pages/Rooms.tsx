import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar,
} from 'recharts';
import { BedDouble, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useDashboard } from '@/context/DashboardContext';
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

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < breakpoint,
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}

// Consistent, ordered list of bedroom categories found in the schema.
const ROOM_ORDER = ['T0', 'T1', 'T2', 'T3', 'T4+'] as const;
type RoomKey = typeof ROOM_ORDER[number];

const ROOM_COLORS: Record<RoomKey, string> = {
  'T0': '#8b5cf6',
  'T1': '#6366f1',
  'T2': '#3b82f6',
  'T3': '#10b981',
  'T4+': '#f59e0b',
};

// Map a raw `quartos` value to one of the canonical buckets.
function bucketOf(raw: string): RoomKey | null {
  if (!raw) return null;
  const n = parseInt(raw.replace(/\D/g, ''), 10);
  if (isNaN(n)) return null;
  if (n === 0) return 'T0';
  if (n === 1) return 'T1';
  if (n === 2) return 'T2';
  if (n === 3) return 'T3';
  return 'T4+';
}

interface RoomSummary {
  key: RoomKey;
  avgM2: number;
  avgPreco: number;
  avgArea: number;
  volume: number;
  share: number;
  yoy: number;
}

function summariseRooms(
  records: HabitacaoRecord[],
  tipoVenda: 'compra' | 'arrendamento',
): RoomSummary[] {
  // Only use muni-level grouped rows so we don't double-count district totals.
  const scoped = records.filter(
    r => r.tipo_venda === tipoVenda
      && r.freguesia === 'Grouped at Municipio level',
  );
  // 2023 snapshot for headline numbers; 2022 for YoY baseline.
  const cur = scoped.filter(r => r.mes_ano.startsWith('2023'));
  const prev = scoped.filter(r => r.mes_ano.startsWith('2022'));

  const totalVolume = cur.reduce((s, r) => s + r.total_rows, 0);

  return ROOM_ORDER.map(key => {
    const curInBucket = cur.filter(r => bucketOf(r.quartos) === key);
    const prevInBucket = prev.filter(r => bucketOf(r.quartos) === key);

    const volume = curInBucket.reduce((s, r) => s + r.total_rows, 0);
    const wSumM2 = curInBucket.reduce((s, r) => s + r.avg_m2 * r.total_rows, 0);
    const wSumPreco = curInBucket.reduce((s, r) => s + r.avg_preco * r.total_rows, 0);
    const wSumArea = curInBucket.reduce((s, r) => s + r.avg_area * r.total_rows, 0);

    const prevVol = prevInBucket.reduce((s, r) => s + r.total_rows, 0);
    const prevWSumM2 = prevInBucket.reduce((s, r) => s + r.avg_m2 * r.total_rows, 0);

    const avgM2 = volume > 0 ? wSumM2 / volume : 0;
    const prevAvgM2 = prevVol > 0 ? prevWSumM2 / prevVol : 0;
    const yoy = prevAvgM2 > 0 ? ((avgM2 - prevAvgM2) / prevAvgM2) * 100 : 0;

    return {
      key,
      avgM2,
      avgPreco: volume > 0 ? wSumPreco / volume : 0,
      avgArea: volume > 0 ? wSumArea / volume : 0,
      volume,
      share: totalVolume > 0 ? volume / totalVolume : 0,
      yoy,
    };
  });
}

function monthlyByRoom(
  records: HabitacaoRecord[],
  tipoVenda: 'compra' | 'arrendamento',
): Array<Record<string, number | string>> {
  const scoped = records.filter(
    r => r.tipo_venda === tipoVenda
      && r.freguesia === 'Grouped at Municipio level',
  );

  // (mes_ano, roomKey) → weighted sum / total
  const map = new Map<string, Map<RoomKey, { w: number; tot: number }>>();
  for (const r of scoped) {
    const k = bucketOf(r.quartos);
    if (!k) continue;
    const rooms = map.get(r.mes_ano) ?? new Map();
    const cur = rooms.get(k) ?? { w: 0, tot: 0 };
    rooms.set(k, { w: cur.w + r.avg_m2 * r.total_rows, tot: cur.tot + r.total_rows });
    map.set(r.mes_ano, rooms);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes_ano, rooms]) => {
      const row: Record<string, number | string> = { mes_ano };
      for (const k of ROOM_ORDER) {
        const cell = rooms.get(k);
        if (cell && cell.tot > 0) row[k] = Math.round(cell.w / cell.tot);
      }
      return row;
    });
}

function YoyPill({ value }: { value: number }) {
  if (Math.abs(value) < 0.05) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
        <Minus className="h-3 w-3" />
        flat
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
        value > 0
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      )}
    >
      {value > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function Rooms() {
  const { districtData, tipoVenda } = useDashboard();
  const isDark = useIsDark();
  const isMobile = useIsMobile();

  const rooms = useMemo(
    () => summariseRooms(districtData, tipoVenda),
    [districtData, tipoVenda],
  );
  const hasAny = rooms.some(r => r.volume > 0);

  const trend = useMemo(
    () => monthlyByRoom(districtData, tipoVenda),
    [districtData, tipoVenda],
  );

  // Which room sells the most in each municipality? Only top 12.
  const muniMix = useMemo(() => {
    const scoped = districtData.filter(
      r => r.tipo_venda === tipoVenda
        && r.freguesia === 'Grouped at Municipio level'
        && r.mes_ano.startsWith('2023'),
    );
    const perMuni = new Map<string, Map<RoomKey, number>>();
    for (const r of scoped) {
      const k = bucketOf(r.quartos);
      if (!k) continue;
      const rm = perMuni.get(r.municipio) ?? new Map();
      rm.set(k, (rm.get(k) ?? 0) + r.total_rows);
      perMuni.set(r.municipio, rm);
    }
    return Array.from(perMuni.entries())
      .map(([municipio, rm]) => {
        const total = Array.from(rm.values()).reduce((s, v) => s + v, 0);
        const row: Record<string, string | number> = { municipio, total };
        // Largest-remainder rounding: floor each percent then distribute the
        // leftover whole points to the buckets with the largest fractional
        // parts. Without this, independent Math.round on 5 values can sum
        // to 99–101 and the chart shows a "101%" axis tick.
        if (total > 0) {
          const exact = ROOM_ORDER.map(k => ((rm.get(k) ?? 0) / total) * 100);
          const floored = exact.map(v => Math.floor(v));
          let remainder = 100 - floored.reduce((s, v) => s + v, 0);
          const order = exact
            .map((v, i) => ({ i, frac: v - Math.floor(v) }))
            .sort((a, b) => b.frac - a.frac);
          for (const { i } of order) {
            if (remainder <= 0) break;
            floored[i] += 1;
            remainder -= 1;
          }
          ROOM_ORDER.forEach((k, i) => { row[k] = floored[i]; });
        } else {
          for (const k of ROOM_ORDER) row[k] = 0;
        }
        return row;
      })
      .sort((a, b) => Number(b.total) - Number(a.total))
      .slice(0, 12);
  }, [districtData, tipoVenda]);

  const fmtM2 = (v: number) => `€${Math.round(v).toLocaleString('pt-PT')}`;
  const fmtPrice = (v: number) => v >= 1_000_000
    ? `€${(v / 1_000_000).toFixed(2)}M`
    : `€${Math.round(v / 1000)}K`;

  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
          <BedDouble className="h-3 w-3 text-indigo-500" />
          Bedroom mix
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Rooms</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deep dive on T0–T4+ apartments across the district.
          {tipoVenda === 'compra' ? ' Sale market.' : ' Rental market.'}
        </p>
      </div>

      {!hasAny ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-8 text-center text-sm text-muted-foreground">
          No 2023 data yet for this market type.
        </div>
      ) : (
        <>
          {/* Per-room KPI cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {rooms.map(r => {
              const color = ROOM_COLORS[r.key];
              return (
                <div
                  key={r.key}
                  className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-4 backdrop-blur-sm transition-all hover:border-border hover:-translate-y-px dark:bg-card/40"
                >
                  <div
                    className="absolute inset-x-0 top-0 h-px"
                    style={{ background: `linear-gradient(to right, ${color}, transparent)` }}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-semibold">{r.key}</span>
                    </div>
                    <YoyPill value={r.yoy} />
                  </div>
                  <div className="mt-3">
                    <div className="text-xl font-semibold tracking-tight tabular-nums">
                      {fmtM2(r.avgM2)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">per m²</div>
                  </div>
                  <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Area</span>
                      <span className="tabular-nums">{Math.round(r.avgArea)} m²</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Price</span>
                      <span className="tabular-nums">{fmtPrice(r.avgPreco)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Share</span>
                      <span className="tabular-nums">{(r.share * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="mt-3 h-1 rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${r.share * 100}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Trend chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">€/m² by bedroom type over time</CardTitle>
              <CardDescription>
                Volume-weighted monthly average, {tipoVenda === 'compra' ? 'sale' : 'rental'} market.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {/* Rooms variant: editorial / minimalist look — fluid
                      "natural" curves, thinner strokes, no grid. The eye
                      compares trajectories more than exact values here. */}
                  <LineChart data={trend} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <XAxis
                      dataKey="mes_ano"
                      tick={{ fill: textColor, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={40}
                    />
                    <YAxis
                      tickFormatter={v => `€${v}`}
                      tick={{ fill: textColor, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                        borderRadius: '8px',
                        color: isDark ? '#f1f5f9' : '#0f172a',
                        fontSize: '12px',
                      }}
                      cursor={{ stroke: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)', strokeWidth: 1, strokeDasharray: '2 4' }}
                      formatter={(value: any, name: any) => [fmtM2(Number(value)), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} iconType="plainline" />
                    {ROOM_ORDER.map(key => (
                      <Line
                        key={key}
                        type="natural"
                        dataKey={key}
                        stroke={ROOM_COLORS[key]}
                        strokeWidth={1.75}
                        dot={false}
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Muni mix stacked bar */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Bedroom mix by municipality</CardTitle>
              <CardDescription>
                Share of 2023 listings by bedroom count — top 12 municipalities by volume.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[340px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={muniMix}
                    layout="vertical"
                    margin={{ top: 5, right: isMobile ? 8 : 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      ticks={isMobile ? [0, 50, 100] : [0, 25, 50, 75, 100]}
                      allowDataOverflow
                      tickFormatter={v => `${v}%`}
                      tick={{ fill: textColor, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="municipio"
                      tick={{ fill: textColor, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={isMobile ? 70 : 100}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(value: any, name: any) => [`${value}%`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    {ROOM_ORDER.map(key => (
                      <Bar
                        key={key}
                        dataKey={key}
                        stackId="mix"
                        fill={ROOM_COLORS[key]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
