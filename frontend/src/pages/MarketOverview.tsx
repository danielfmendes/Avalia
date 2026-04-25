import { useDashboard } from '@/context/DashboardContext';
import { LisbonMap } from '@/components/LisbonMap';
import { MetricCards } from '@/components/MetricCards';
import { PriceChart } from '@/components/PriceChart';
import { DistrictSummary } from '@/components/DistrictSummary';
import { FilterBar } from '@/components/FilterBar';
import { ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MarketOverview() {
  const { drilldown, resetDrilldown, setMunicipio, tipoVenda } = useDashboard();

  return (
    <div className="space-y-6">
      {/* Header with breadcrumb */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
            Market Intelligence
          </div>
          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={resetDrilldown}
              className={cn(
                'text-3xl font-semibold tracking-tight transition-colors',
                drilldown.municipio
                  ? 'text-muted-foreground/60 hover:text-foreground'
                  : 'text-foreground',
              )}
              disabled={!drilldown.municipio}
            >
              {drilldown.municipio ? 'Lisboa' : 'Lisboa District'}
            </button>
            {drilldown.municipio && (
              <>
                <ChevronRight className="h-5 w-5 text-muted-foreground/40" />
                <button
                  onClick={() => setMunicipio(drilldown.municipio)}
                  className={cn(
                    'text-3xl font-semibold tracking-tight transition-colors',
                    drilldown.freguesia
                      ? 'text-muted-foreground/60 hover:text-foreground'
                      : 'text-foreground',
                  )}
                  disabled={!drilldown.freguesia}
                >
                  {drilldown.municipio}
                </button>
              </>
            )}
            {drilldown.freguesia && (
              <>
                <ChevronRight className="h-5 w-5 text-muted-foreground/40" />
                <span className="text-3xl font-semibold tracking-tight">{drilldown.freguesia}</span>
              </>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {tipoVenda === 'compra' ? 'Sales market' : 'Rental market'} ·
            prices, listing volume, and year-over-year dynamics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(drilldown.municipio || drilldown.freguesia) && (
            <button
              onClick={resetDrilldown}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors"
            >
              <X className="h-3 w-3" />
              Back to district
            </button>
          )}
        </div>
      </div>

      {/* Filters — buy/rent toggle + rooms + area */}
      <FilterBar />

      {/* District summary strip — always visible */}
      <DistrictSummary />

      {/* Map — mobile placement (between summary and KPIs) */}
      <div className="xl:hidden rounded-2xl border border-border/60 bg-card/80 p-4 backdrop-blur-sm dark:bg-card/40">
        <LisbonMap />
      </div>

      {/* KPI row (4 cards) */}
      <MetricCards />

      {/* Chart + Map grid (map only renders here on desktop) */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <PriceChart />
        </div>
        <div className="hidden xl:col-span-2 xl:block">
          <div className="h-full rounded-2xl border border-border/60 bg-card/80 p-4 backdrop-blur-sm dark:bg-card/40">
            <LisbonMap />
          </div>
        </div>
      </div>

    </div>
  );
}
