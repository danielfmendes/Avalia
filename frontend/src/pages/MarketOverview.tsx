import { useDashboard } from '@/context/DashboardContext';
import { LisbonMap } from '@/components/LisbonMap';
import { MetricCards } from '@/components/MetricCards';
import { PriceChart } from '@/components/PriceChart';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

export function MarketOverview() {
  const { drilldown, resetDrilldown, tipoVenda } = useDashboard();

  const locationLabel = drilldown.freguesia
    ? `${drilldown.freguesia} · ${drilldown.municipio}`
    : drilldown.municipio
      ? drilldown.municipio
      : 'Lisboa District';

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Market Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time pricing data for the Lisboa metropolitan area
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(drilldown.municipio || drilldown.freguesia) && (
            <button
              onClick={resetDrilldown}
              className="flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium hover:bg-muted transition-colors"
            >
              <X className="h-3 w-3" />
              Clear filter
            </button>
          )}
          <Badge variant="outline" className="text-xs">
            {locationLabel}
          </Badge>
          <Badge variant={tipoVenda === 'compra' ? 'default' : 'secondary'} className="text-xs capitalize">
            {tipoVenda}
          </Badge>
        </div>
      </div>

      {/* Metric cards */}
      <MetricCards />

      {/* Chart + Map grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Chart — 3/5 width on xl */}
        <div className="xl:col-span-3">
          <PriceChart />
        </div>

        {/* Map — 2/5 width on xl */}
        <div className="xl:col-span-2">
          <div className="rounded-xl border bg-card p-4 shadow-sm h-full">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">District Map</h2>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Colored by €/m²
              </span>
            </div>
            <LisbonMap />
          </div>
        </div>
      </div>
    </div>
  );
}
