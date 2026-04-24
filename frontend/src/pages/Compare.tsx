import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { GitCompareArrows, Plus, X, Crown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useDashboard } from '@/context/DashboardContext';
import { getMunicipioStats } from '@/lib/dataUtils';
import { cn } from '@/lib/utils';
import type { MunicipioStat, HabitacaoRecord } from '@/lib/types';

const SERIES_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#d946ef'];

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

function pricePerM2Series(
  records: HabitacaoRecord[],
  municipio: string,
  tipoVenda: 'compra' | 'arrendamento',
): Array<{ mes_ano: string; value: number }> {
  const scoped = records.filter(
    r => r.municipio === municipio
      && r.tipo_venda === tipoVenda
      && r.freguesia === 'Grouped at Municipio level',
  );
  const map = new Map<string, { w: number; tot: number }>();
  for (const r of scoped) {
    const cur = map.get(r.mes_ano) ?? { w: 0, tot: 0 };
    map.set(r.mes_ano, { w: cur.w + r.avg_m2 * r.total_rows, tot: cur.tot + r.total_rows });
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes_ano, { w, tot }]) => ({ mes_ano, value: tot > 0 ? w / tot : 0 }));
}

function ChipSelector({
  all, selected, onAdd, onRemove, max,
}: {
  all: string[];
  selected: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  max: number;
}) {
  const [open, setOpen] = useState(false);
  const available = all.filter(n => !selected.includes(n)).sort((a, b) => a.localeCompare(b));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selected.map((name, i) => (
        <span
          key={name}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 py-1 pl-2 pr-1 text-xs font-medium"
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: SERIES_COLORS[i] }}
          />
          {name}
          <button
            onClick={() => onRemove(name)}
            className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Remove ${name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {selected.length < max && (
        <div className="relative">
          <button
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border"
          >
            <Plus className="h-3 w-3" />
            Add municipality
          </button>
          {open && (
            <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
              {available.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">No more options</div>
              ) : (
                available.map(name => (
                  <button
                    key={name}
                    onClick={() => {
                      onAdd(name);
                      setOpen(false);
                    }}
                    className="flex w-full items-center rounded-md px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    {name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface MetricRowProps {
  label: string;
  sub: string;
  values: Array<{ muni: string; raw: number; formatted: string }>;
  higherIsBetter: boolean;
  colors: string[];
}

function MetricRow({ label, sub, values, higherIsBetter, colors }: MetricRowProps) {
  if (values.length === 0) return null;
  const best = values.reduce((a, b) =>
    (higherIsBetter ? b.raw > a.raw : b.raw < a.raw) ? b : a,
  );
  const maxAbs = Math.max(...values.map(v => Math.abs(v.raw)), 0.0001);

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm dark:bg-card/30">
      <div className="mb-2 flex items-baseline justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-[10px] text-muted-foreground/70">{sub}</div>
        </div>
      </div>
      <div className="space-y-2">
        {values.map((v, i) => {
          const pct = (Math.abs(v.raw) / maxAbs) * 100;
          const isWinner = v.muni === best.muni;
          return (
            <div key={v.muni} className="grid grid-cols-[90px_1fr_auto] items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-medium truncate">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: colors[i] }}
                />
                <span className="truncate">{v.muni}</span>
              </div>
              <div className="relative h-1.5 rounded-full bg-muted/60 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: colors[i] }}
                />
              </div>
              <div className="flex items-center gap-1.5 min-w-[80px] justify-end">
                <span className={cn('text-xs font-semibold tabular-nums', isWinner && 'text-emerald-600 dark:text-emerald-400')}>
                  {v.formatted}
                </span>
                {isWinner && <Crown className="h-3 w-3 text-amber-500" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Compare() {
  const { districtData, tipoVenda } = useDashboard();
  const isDark = useIsDark();
  const muniStats = useMemo<MunicipioStat[]>(
    () => getMunicipioStats(districtData),
    [districtData],
  );
  const allNames = useMemo(() => muniStats.map(s => s.name), [muniStats]);

  const [selected, setSelected] = useState<string[]>(() => {
    // Default to the three most expensive municipalities by default.
    const sorted = [...muniStats].sort((a, b) => b.avg_m2 - a.avg_m2);
    return sorted.slice(0, Math.min(3, sorted.length)).map(s => s.name);
  });

  // Re-seed selection once districtData arrives.
  useEffect(() => {
    if (selected.length === 0 && muniStats.length > 0) {
      const top = [...muniStats].sort((a, b) => b.avg_m2 - a.avg_m2).slice(0, 3).map(s => s.name);
      setSelected(top);
    }
  }, [muniStats, selected.length]);

  const selectedStats = useMemo(
    () => selected.map(name => muniStats.find(s => s.name === name)).filter(Boolean) as MunicipioStat[],
    [selected, muniStats],
  );

  const trendSeries = useMemo(() => {
    return selected.map(name => pricePerM2Series(districtData, name, tipoVenda));
  }, [selected, districtData, tipoVenda]);

  const combinedChart = useMemo(() => {
    const monthSet = new Set<string>();
    trendSeries.forEach(s => s.forEach(p => monthSet.add(p.mes_ano)));
    const months = [...monthSet].sort();
    return months.map(mes_ano => {
      const row: Record<string, string | number> = { mes_ano };
      selected.forEach((name, i) => {
        const pt = trendSeries[i].find(p => p.mes_ano === mes_ano);
        if (pt) row[name] = Math.round(pt.value);
      });
      return row;
    });
  }, [trendSeries, selected]);

  const fmtM2 = (v: number) => `€${Math.round(v).toLocaleString('pt-PT')}`;
  const fmtPrice = (v: number) => v >= 1_000_000
    ? `€${(v / 1_000_000).toFixed(2)}M`
    : `€${Math.round(v / 1000)}K`;
  const fmtInt = (v: number) => v.toLocaleString('pt-PT');

  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
            <GitCompareArrows className="h-3 w-3 text-indigo-500" />
            Side by side
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Compare</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick up to four municipalities and see how they stack up across price, growth, and yield.
          </p>
        </div>
      </div>

      {/* Chip selector */}
      <div className="rounded-2xl border border-border/60 bg-card/80 p-4 backdrop-blur-sm dark:bg-card/40">
        <ChipSelector
          all={allNames}
          selected={selected}
          onAdd={name => setSelected(s => (s.length < 4 ? [...s, name] : s))}
          onRemove={name => setSelected(s => s.filter(n => n !== name))}
          max={4}
        />
      </div>

      {selectedStats.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-8 text-center text-sm text-muted-foreground">
          Select at least one municipality to start comparing.
        </div>
      ) : (
        <>
          {/* Metric rows */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <MetricRow
              label="Price per m²"
              sub="2023 weighted average"
              higherIsBetter={false}
              colors={SERIES_COLORS}
              values={selectedStats.map(s => ({
                muni: s.name, raw: s.avg_m2, formatted: fmtM2(s.avg_m2),
              }))}
            />
            <MetricRow
              label="Average sale price"
              sub="2023 weighted average"
              higherIsBetter={false}
              colors={SERIES_COLORS}
              values={selectedStats.map(s => ({
                muni: s.name, raw: s.avg_preco, formatted: fmtPrice(s.avg_preco),
              }))}
            />
            <MetricRow
              label="Year-over-year change"
              sub="€/m² growth 2022 → 2023"
              higherIsBetter={true}
              colors={SERIES_COLORS}
              values={selectedStats.map(s => ({
                muni: s.name, raw: s.yoy_change,
                formatted: `${s.yoy_change >= 0 ? '+' : ''}${s.yoy_change.toFixed(1)}%`,
              }))}
            />
            <MetricRow
              label="Gross rental yield"
              sub="implied annual, compra vs arrendamento"
              higherIsBetter={true}
              colors={SERIES_COLORS}
              values={selectedStats.map(s => ({
                muni: s.name, raw: s.rental_yield,
                formatted: `${s.rental_yield.toFixed(1)}%`,
              }))}
            />
            <MetricRow
              label="Average listing area"
              sub="square metres per sale"
              higherIsBetter={true}
              colors={SERIES_COLORS}
              values={selectedStats.map(s => ({
                muni: s.name, raw: s.avg_area, formatted: `${Math.round(s.avg_area)} m²`,
              }))}
            />
            <MetricRow
              label="Listings volume"
              sub="2023 total"
              higherIsBetter={true}
              colors={SERIES_COLORS}
              values={selectedStats.map(s => ({
                muni: s.name, raw: s.total_rows, formatted: fmtInt(s.total_rows),
              }))}
            />
          </div>

          {/* Trend chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Price per m² over time</CardTitle>
              <CardDescription>
                {tipoVenda === 'compra' ? 'Sale' : 'Rent'} €/m² history — weighted by listing volume.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={combinedChart} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis
                      dataKey="mes_ano"
                      tick={{ fill: textColor, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      interval={5}
                    />
                    <YAxis
                      tickFormatter={v => `€${Math.round(v / 100) * 100}`}
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
                      formatter={(value: any) => fmtM2(Number(value))}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '11px' }}
                      iconType="plainline"
                    />
                    {selected.map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={SERIES_COLORS[i]}
                        strokeWidth={2}
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
        </>
      )}
    </div>
  );
}
