import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area,
} from 'recharts';
import {
  History, Play, Pause, RotateCcw, TrendingUp, TrendingDown, SkipBack, SkipForward,
} from 'lucide-react';
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

function Scrubber({
  progressPct, disabled, onScrub,
}: {
  progressPct: number;
  disabled: boolean;
  onScrub: (pct: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const pctFromEvent = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => onScrub(pctFromEvent(e.clientX));
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  return (
    <div
      ref={trackRef}
      onPointerDown={e => {
        if (disabled) return;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        setDragging(true);
        onScrub(pctFromEvent(e.clientX));
      }}
      className={cn(
        'relative h-5 w-full select-none',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      )}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progressPct)}
    >
      {/* Track */}
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
      {/* Filled portion */}
      <div
        className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-indigo-500"
        style={{ width: `${progressPct}%` }}
      />
      {/* Thumb */}
      <div
        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500 shadow-[0_0_0_4px_rgba(99,102,241,0.18)] ring-2 ring-background"
        style={{ left: `${progressPct}%` }}
      />
    </div>
  );
}

function yoyColor(pct: number | null, isDark: boolean): string {
  if (pct === null) return isDark ? '#64748b' : '#94a3b8';
  const capped = Math.max(-25, Math.min(25, pct));
  const t = (capped + 25) / 50;
  if (t > 0.5) {
    const g = Math.round(150 + (t - 0.5) * 200);
    return `rgb(16, ${g}, 129)`;
  }
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

  // Snap to the newest month on first load / when list length changes.
  useEffect(() => {
    if (allMonths.length > 0 && (index >= allMonths.length || index === 0)) {
      setIndex(allMonths.length - 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMonths.length]);

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
    }, 400);
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

  const movers = useMemo(() => {
    const withYoy = snapshot.filter(s => s.yoyPct !== null) as Array<MuniSnapshot & { yoyPct: number }>;
    const gainers = [...withYoy].sort((a, b) => b.yoyPct - a.yoyPct).slice(0, 3);
    const losers = [...withYoy].sort((a, b) => a.yoyPct - b.yoyPct).slice(0, 3);
    return { gainers, losers };
  }, [snapshot]);

  // District-level series across all months — drives the mini trace + high/low tags.
  const districtSeries = useMemo(() => {
    const scope = districtData.filter(
      r => r.tipo_venda === tipoVenda && r.freguesia === 'Grouped at Municipio level',
    );
    return allMonths.map(mes_ano => {
      const rs = scope.filter(r => r.mes_ano === mes_ano);
      return { mes_ano, value: wavg(rs, 'avg_m2') };
    });
  }, [districtData, tipoVenda, allMonths]);

  const districtAvg = districtSeries[index]?.value ?? 0;

  const { allTimeHigh, allTimeLow } = useMemo(() => {
    if (districtSeries.length === 0) return { allTimeHigh: null, allTimeLow: null };
    let hi = districtSeries[0], lo = districtSeries[0];
    for (const p of districtSeries) {
      if (p.value > hi.value) hi = p;
      if (p.value < lo.value && p.value > 0) lo = p;
    }
    return { allTimeHigh: hi, allTimeLow: lo };
  }, [districtSeries]);

  const isHigh = allTimeHigh && currentMonth === allTimeHigh.mes_ano;
  const isLow = allTimeLow && currentMonth === allTimeLow.mes_ano;

  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';

  const canPlay = allMonths.length > 1;
  const progressPct = allMonths.length > 1 ? (index / (allMonths.length - 1)) * 100 : 0;

  // Year tick markers under the slider — one per year in the data.
  const yearMarks = useMemo(() => {
    if (allMonths.length === 0) return [];
    const marks: Array<{ year: string; leftPct: number }> = [];
    let seen = '';
    allMonths.forEach((m, i) => {
      const y = m.slice(0, 4);
      if (y !== seen) {
        marks.push({ year: y, leftPct: (i / (allMonths.length - 1)) * 100 });
        seen = y;
      }
    });
    return marks;
  }, [allMonths]);

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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
        <div className="flex items-stretch gap-2.5">
          <div className="rounded-2xl border border-border/60 bg-card/60 px-4 py-3 backdrop-blur-sm dark:bg-card/30">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              District €/m²
            </div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums">
              €{Math.round(districtAvg).toLocaleString('pt-PT')}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {snapshot.length} munis · {snapshot.reduce((s, r) => s + r.volume, 0).toLocaleString('pt-PT')} listings
              {isHigh && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="h-2.5 w-2.5" /> All-time high
                </span>
              )}
              {isLow && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-rose-600 dark:text-rose-400">
                  <TrendingDown className="h-2.5 w-2.5" /> All-time low
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scrubber */}
      <div className="rounded-2xl border border-border/60 bg-card/80 p-5 backdrop-blur-sm dark:bg-card/40">
        {/* Inline trace above the slider — shows the district's price path */}
        <div className="relative mb-3 h-[64px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={districtSeries} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="tmDistrictFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke="#6366f1"
                strokeWidth={1.5}
                fill="url(#tmDistrictFill)"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
          {/* Playhead line */}
          {allMonths.length > 1 && (
            <div
              className="pointer-events-none absolute inset-y-0 w-[1.5px] bg-indigo-500"
              style={{ left: `calc(${progressPct}% - 0.75px)` }}
            >
              <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,0.18)]" />
            </div>
          )}
        </div>

        {/* Custom slider — shares the trace's 0→100% coordinate system so the
            thumb always lines up with the playhead line above it. */}
        <Scrubber
          progressPct={progressPct}
          disabled={!canPlay}
          onScrub={pct => {
            if (allMonths.length === 0) return;
            const next = Math.round(pct * (allMonths.length - 1));
            setIndex(Math.max(0, Math.min(allMonths.length - 1, next)));
            setPlaying(false);
          }}
        />

        {/* Year ticks — anchored to the same 0→100% axis */}
        <div className="relative mt-1 h-4">
          {yearMarks.map(mark => (
            <span
              key={mark.year}
              className="absolute top-0 text-[9px] tabular-nums text-muted-foreground"
              style={{ left: `${mark.leftPct}%`, transform: 'translateX(-50%)' }}
            >
              <span className="absolute -top-1 left-1/2 h-1 w-px -translate-x-1/2 bg-muted-foreground/30" />
              {mark.year}
            </span>
          ))}
        </div>

        {/* Play controls — stacked below the slider so the slider can span the full width */}
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => { setIndex(0); setPlaying(false); }}
            disabled={!canPlay}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
            aria-label="Jump to start"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </button>
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
            onClick={() => { setIndex(allMonths.length - 1); setPlaying(false); }}
            disabled={!canPlay}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
            aria-label="Jump to end"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { setIndex(0); setPlaying(false); }}
            disabled={!canPlay}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
            aria-label="Restart"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Movers */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              Biggest gainers vs last year
            </div>
            <span className="text-[10px] text-muted-foreground">12-month change</span>
          </div>
          <div className="mt-3 space-y-2">
            {movers.gainers.length === 0 && (
              <div className="text-xs text-muted-foreground">Not enough history yet.</div>
            )}
            {movers.gainers.map((m, i) => (
              <div
                key={m.municipio}
                className="flex items-center justify-between rounded-lg border border-emerald-500/10 bg-background/50 px-3 py-2 dark:bg-background/20"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    i === 0 ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      : i === 1 ? 'bg-slate-400/20 text-slate-600 dark:text-slate-300'
                        : 'bg-orange-600/20 text-orange-700 dark:text-orange-500',
                  )}>
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{m.municipio}</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      €{Math.round(m.avgM2).toLocaleString('pt-PT')}/m²
                    </div>
                  </div>
                </div>
                <span className="text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  +{m.yoyPct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.03] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              <TrendingDown className="h-3 w-3 text-rose-500" />
              Biggest losers vs last year
            </div>
            <span className="text-[10px] text-muted-foreground">12-month change</span>
          </div>
          <div className="mt-3 space-y-2">
            {movers.losers.length === 0 && (
              <div className="text-xs text-muted-foreground">Not enough history yet.</div>
            )}
            {movers.losers.map((m, i) => (
              <div
                key={m.municipio}
                className="flex items-center justify-between rounded-lg border border-rose-500/10 bg-background/50 px-3 py-2 dark:bg-background/20"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted/60 text-[10px] font-bold text-muted-foreground">
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{m.municipio}</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      €{Math.round(m.avgM2).toLocaleString('pt-PT')}/m²
                    </div>
                  </div>
                </div>
                <span
                  className={cn(
                    'text-base font-semibold tabular-nums',
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
          <CardTitle className="text-base">
            Snapshot · {currentMonth ? monthLabel(currentMonth) : '—'}
          </CardTitle>
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
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-4 rounded-sm" style={{ backgroundColor: 'rgb(16, 200, 129)' }} />
              Gaining YoY
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-4 rounded-sm" style={{ backgroundColor: 'rgb(220, 70, 90)' }} />
              Losing YoY
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-4 rounded-sm bg-slate-400/60" />
              No history yet
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
