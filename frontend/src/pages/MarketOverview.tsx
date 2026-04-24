import { useDashboard } from '@/context/DashboardContext';
import { LisbonMap } from '@/components/LisbonMap';
import { MetricCards } from '@/components/MetricCards';
import { PriceChart } from '@/components/PriceChart';
import { X } from 'lucide-react';

export function MarketOverview() {
  const { drilldown, resetDrilldown, tipoVenda } = useDashboard();

  const locationLabel = drilldown.freguesia
    ? `${drilldown.freguesia} · ${drilldown.municipio}`
    : drilldown.municipio
      ? drilldown.municipio
      : 'Lisboa District';

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
            Market Intelligence
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {locationLabel}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live pricing, volume, and year-over-year deltas for the Lisboa metropolitan area
            {tipoVenda === 'arrendamento' ? ' · rental market' : ' · sales market'}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(drilldown.municipio || drilldown.freguesia) && (
            <button
              onClick={resetDrilldown}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors"
            >
              <X className="h-3 w-3" />
              Clear filter
            </button>
          )}
        </div>
      </div>

      {/* KPI row */}
      <MetricCards />

      {/* Chart + Map grid */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <PriceChart />
        </div>

        <div className="xl:col-span-2">
          <div className="rounded-2xl border border-border/60 bg-card/80 p-4 backdrop-blur-sm dark:bg-card/40 h-full">
            <LisbonMap />
          </div>
        </div>
      </div>
    </div>
  );
}
