import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { History, Play, Pause, RotateCcw, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useDashboard } from '@/context/DashboardContext';
import { wavg, minusYear } from '@/lib/dataUtils';
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

function monthLabel(mesAno: string): string {
  const [y, m] = mesAno.split('-');
  if (!y || !m) return mesAno;
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', {
    month: 'short', year: 'numeric',
  });
}

interface MuniSnapshot {
  municipio: string;
  avgM2: number;
  avgPreco: number;
  volume: number;
  yoyPct: number | null;
}

function snapshotAt(
  records: HabitacaoRecord[],
  mesAno: string,
  tipoVenda: 'compra' | 'arrendamento',
): MuniSnapshot[] {
  const prevMesAno = minusYear(mesAno);
  const scope = records.filter(
    r => r.tipo_venda === tipoVenda && r.freguesia === 'Grouped at Municipio level',
  );
  const cur = scope.filter(r => r.mes_ano === mesAno);
  const prev = scope.filter(r => r.mes_ano === prevMesAno);
  const munis = [...new Set(cur.map(r => r.municipio))];
  return munis
    .map(name => {
      const curRs = cur.filter(r => r.municipio === name);
      const prevRs = prev.filter(r => r.municipio === name);
      const avgM2 = wavg(curRs, 'avg_m2');
      const prevM2 = wavg(prevRs, 'avg_m2');
      return {
        municipio: name,
        avgM2,
        avgPreco: wavg(curRs, 'avg_preco'),
        volume: curRs.reduce((s, r) => s + r.total_rows, 0),
        yoyPct: prevM2 > 0 ? ((avgM2 - prevM2) / prevM2) * 100 : null,
      };
    })
    .filter(r => r.avgM2 > 0)
    .sort((a, b) => b.avgM2 - a.avgM2);
}

function yoyColor(pct: number | null, isDark: boolean): string {
  if (pct === null) return isDark ? '#64748b' : '#94a3b8';
  const capped = Math.max(-25, Math.min(25, pct));
  const t = (capped + 25) / 50; // 0..1
  if (t > 0.5) {
    // green scale
    const g = Math.round(150 + (t - 0.5) * 200);
    return `rgb(16, ${g}, 129)`;
  }
  // red scale (low t = more red)
  const r = Math.round(220 - t * 80);
  return `rgb(${r}, 70, 90)`;
}

export function TimeMachine() {
  const { districtData, tipoVenda } = useDashboard();
  const isDark = useIsDark();

  const allMonths = useMemo(() => {
    const set = new Set<string>();
    for (const r of districtData) {
      if (r.tipo_venda === tipoVenda && r.freguesia === 'Grouped at Municipio level') {
        set.add(r.mes_ano);
      }
    }
    return [...set].sort();
  }, [districtData, tipoVenda]);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Snap index to end when month list changes.
  useEffect(() => {
    if (allMonths.length > 0 && index >= allMonths.length) {
      setIndex(allMonths.length - 1);
    }
    if (allMonths.length > 0 && index === 0) {
      // Default to last month on first render.
      setIndex(allMonths.length - 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMonths.length]);

  // Playback timer.
  useEffect(() => {
    if (!playing) return;
    timerRef.current = setInterval(() => {
      setIndex(i => {
        if (i >= allMonths.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, allMonths.length]);

  const currentMonth = allMonths[index] ?? '';
  const snapshot = useMemo(
    () => snapshotAt(districtData, currentMonth, tipoVenda),
    [districtData, currentMonth, tipoVenda],
  );

  const chartData = useMemo(
    () => snapshot.slice(0, 16).map(s => ({
      municipio: s.municipio,
      avgM2: Math.round(s.avgM2),
      fill: yoyColor(s.yoyPct, isDark),
    })),
    [snapshot, isDark],
  );

  // Biggest movers vs one year ago.
  const movers = useMemo(() => {
    const withYoy = snapshot.filter(s => s.yoyPct !== null) as Array<MuniSnapshot & { yoyPct: number }>;
    const gainers = [...withYoy].sort((a, b) => b.yoyPct - a.yoyPct).slice(0, 3);
    const losers = [...withYoy].sort((a, b) => a.yoyPct - b.yoyPct).slice(0, 3);
    return { gainers, losers };
  }, [snapshot]);

  const districtAvg = useMemo(() => {
    if (snapshot.length === 0) return 0;
    const wSum = snapshot.reduce((s, m) => s + m.avgM2 * m.volume, 0);
    const vol = snapshot.reduce((s, m) => s + m.volume, 0);
    return vol > 0 ? wSum / vol : 0;
  }, [snapshot]);

  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';

  const canPlay = allMonths.length > 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
            <History className="h-3 w-3 text-indigo-500" />
            Time machine
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {currentMonth ? monthLabel(currentMonth) : 'Time Machine'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scrub through history to see how each municipality looked at a given month.
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/60 px-4 py-3 backdrop-blur-sm dark:bg-card/30">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            District weighted €/m²
          </div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums">
            €{Math.round(districtAvg).toLocaleString('pt-PT')}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {snapshot.length} municipalities · {snapshot.reduce((s, r) => s + r.volume, 0).toLocaleString('pt-PT')} listings
          </div>
        </div>
      </div>

      {/* Scrubber */}
      <div className="rounded-2xl border border-border/60 bg-card/80 p-5 backdrop-blur-sm dark:bg-card/40">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPlaying(p => !p)}
            disabled={!canPlay}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full border transition-colors',
              playing
                ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                : 'border-border/60 bg-background hover:border-border',
              !canPlay && 'opacity-50 cursor-not-allowed',
            )}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>
          <button
            onClick={() => setIndex(0)}
            disabled={!canPlay}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
            aria-label="Restart"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <input
              type="range"
              min={0}
              max={Math.max(0, allMonths.length - 1)}
              value={index}
              onChange={e => {
                setIndex(Number(e.target.value));
                setPlaying(false);
              }}
              className="w-full accent-indigo-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{allMonths[0] ? monthLabel(allMonths[0]) : '—'}</span>
              <span className="font-semibold text-foreground tabular-nums">
                {currentMonth ? monthLabel(currentMonth) : '—'}
              </span>
              <span>
                {allMonths[allMonths.length - 1] ? monthLabel(allMonths[allMonths.length - 1]) : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Movers */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm dark:bg-card/30">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-3 w-3 text-emerald-500" />
            Biggest gainers vs last year
          </div>
          <div className="mt-3 space-y-2">
            {movers.gainers.length === 0 && (
              <div className="text-xs text-muted-foreground">Not enough history yet.</div>
            )}
            {movers.gainers.map(m => (
              <div key={m.municipio} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{m.municipio}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    €{Math.round(m.avgM2).toLocaleString('pt-PT')}/m²
                  </div>
                </div>
                <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  +{m.yoyPct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm dark:bg-card/30">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <TrendingDown className="h-3 w-3 text-rose-500" />
            Biggest losers vs last year
          </div>
          <div className="mt-3 space-y-2">
            {movers.losers.length === 0 && (
              <div className="text-xs text-muted-foreground">Not enough history yet.</div>
            )}
            {movers.losers.map(m => (
              <div key={m.municipio} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{m.municipio}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    €{Math.round(m.avgM2).toLocaleString('pt-PT')}/m²
                  </div>
                </div>
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    m.yoyPct >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400',
                  )}
                >
                  {m.yoyPct >= 0 ? '+' : ''}
                  {m.yoyPct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Snapshot bar chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Snapshot at {currentMonth ? monthLabel(currentMonth) : '—'}</CardTitle>
          <CardDescription>
            €/m² per municipality — bars tinted by year-over-year change.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[360px] w-full">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No data at this month.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 40, bottom: 5 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={v => `€${v}`}
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
                    width={110}
                  />
                  <Tooltip
                    cursor={{ fill: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}
                    contentStyle={{
                      backgroundColor: isDark ? '#1e293b' : '#ffffff',
                      border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: any) => [`€${Number(value).toLocaleString('pt-PT')}/m²`, 'Price']}
                  />
                  <Bar dataKey="avgM2" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-4 rounded-sm" style={{ backgroundColor: 'rgb(16, 200, 129)' }} />
              +YoY
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-4 rounded-sm" style={{ backgroundColor: 'rgb(220, 70, 90)' }} />
              –YoY
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-4 rounded-sm bg-slate-400/60" />
              No history
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
