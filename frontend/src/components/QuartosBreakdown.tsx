import { useMemo } from 'react';
import { useDashboard } from '@/context/DashboardContext';
import { BedDouble } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoomStat {
  quartos: string;
  volume: number;
  avgM2: number;
  share: number;
}

// Sort by the numeric part of the Tx label. Non-Tx values sort last.
function orderOf(q: string): number {
  const n = parseInt(q.replace(/\D/g, ''), 10);
  return isNaN(n) ? 99 : n;
}

export function QuartosBreakdown() {
  const { filteredData, drilldown } = useDashboard();

  const rooms = useMemo<RoomStat[]>(() => {
    // Group by quartos, using weighted €/m² and total_rows as volume.
    const map = new Map<string, { w: number; tot: number }>();
    for (const r of filteredData) {
      const q = r.quartos || '—';
      const cur = map.get(q) ?? { w: 0, tot: 0 };
      map.set(q, { w: cur.w + r.avg_m2 * r.total_rows, tot: cur.tot + r.total_rows });
    }
    const totalAll = Array.from(map.values()).reduce((s, v) => s + v.tot, 0);
    if (totalAll === 0) return [];
    return Array.from(map.entries())
      .map(([quartos, { w, tot }]) => ({
        quartos,
        volume: tot,
        avgM2: tot > 0 ? w / tot : 0,
        share: tot / totalAll,
      }))
      .sort((a, b) => orderOf(a.quartos) - orderOf(b.quartos));
  }, [filteredData]);

  if (rooms.length === 0) return null;

  const scope = drilldown.freguesia
    ? `${drilldown.freguesia}, ${drilldown.municipio}`
    : drilldown.municipio ?? 'Lisboa District';

  const maxM2 = Math.max(...rooms.map(r => r.avgM2));

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-5 backdrop-blur-sm dark:bg-card/40">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
            <BedDouble className="h-3 w-3" />
            Bedroom mix
          </div>
          <div className="mt-1 text-base font-semibold">{scope}</div>
        </div>
        <div className="text-[10px] text-muted-foreground">
          {rooms.reduce((s, r) => s + r.volume, 0).toLocaleString('pt-PT')} listings
        </div>
      </div>

      <div className="space-y-2.5">
        {rooms.map(r => {
          const barPct = maxM2 > 0 ? (r.avgM2 / maxM2) * 100 : 0;
          return (
            <div key={r.quartos} className="flex items-center gap-3">
              <div className="w-10 shrink-0 text-xs font-mono font-semibold text-muted-foreground">
                {r.quartos}
              </div>
              <div className="flex-1">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {(r.share * 100).toFixed(0)}% of listings
                  </span>
                  <span className="text-xs font-semibold tabular-nums">
                    €{Math.round(r.avgM2).toLocaleString('pt-PT')}<span className="text-muted-foreground">/m²</span>
                  </span>
                </div>
                <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={cn(
                      'absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500/80 to-violet-500/80 transition-all',
                    )}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
