import { useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { ChevronLeft, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/context/DashboardContext';
import { getMunicipioStats, getFreguesias } from '@/lib/dataUtils';

const GEO_URL = '/geodata/lisbon-municipalities.json';

function getPriceColor(m2: number, selected: boolean): string {
  const opacity = selected ? '1' : '0.85';
  if (m2 === 0) return `rgba(148,163,184,${opacity})`;  // gray while loading
  if (m2 < 2200) return `rgba(34,197,94,${opacity})`;
  if (m2 < 2800) return `rgba(132,204,22,${opacity})`;
  if (m2 < 3500) return `rgba(234,179,8,${opacity})`;
  if (m2 < 4500) return `rgba(249,115,22,${opacity})`;
  return `rgba(239,68,68,${opacity})`;
}

function getPriceLabel(m2: number): string {
  return `€${Math.round(m2 / 100) * 100}/m²`;
}

interface TooltipState {
  name: string;
  m2: number;
  yoy: number;
}

export function LisbonMap() {
  const { drilldown, setMunicipio, setFreguesia, resetDrilldown, allData } = useDashboard();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const muniStats = useMemo(() => getMunicipioStats(allData), [allData]);
  const statsByName = useMemo(
    () => Object.fromEntries(muniStats.map(s => [s.name, s])),
    [muniStats],
  );

  const parishes = useMemo(
    () => (drilldown.municipio ? getFreguesias(allData, drilldown.municipio) : []),
    [allData, drilldown.municipio],
  );

  if (drilldown.municipio) {
    const stat = statsByName[drilldown.municipio];
    return (
      <div className="space-y-3">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <button
            onClick={resetDrilldown}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            All Districts
          </button>
          <span className="text-xs text-muted-foreground">/</span>
          <span className="text-xs font-medium">{drilldown.municipio}</span>
          {drilldown.freguesia && (
            <>
              <span className="text-xs text-muted-foreground">/</span>
              <span className="text-xs font-medium text-primary">{drilldown.freguesia}</span>
            </>
          )}
        </div>

        {/* Municipio header */}
        <div className="rounded-xl border bg-card p-3 flex items-center justify-between">
          <div>
            <div className="font-semibold">{drilldown.municipio}</div>
            <div className="text-xs text-muted-foreground">Select a parish to drill down</div>
          </div>
          {stat && (
            <div className="text-right">
              <div className="text-sm font-bold">{getPriceLabel(stat.avg_m2)}</div>
              <div
                className={cn(
                  'text-xs font-medium',
                  stat.yoy_change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                )}
              >
                {stat.yoy_change >= 0 ? '+' : ''}{stat.yoy_change.toFixed(1)}% YoY
              </div>
            </div>
          )}
        </div>

        {/* Parish grid */}
        <div className="grid grid-cols-2 gap-2">
          {parishes.map(parish => (
            <button
              key={parish}
              onClick={() =>
                drilldown.freguesia === parish ? setFreguesia(null) : setFreguesia(parish)
              }
              className={cn(
                'rounded-lg border p-3 text-left transition-all hover:shadow-md',
                drilldown.freguesia === parish
                  ? 'border-primary bg-primary/10 ring-1 ring-primary'
                  : 'bg-card hover:bg-accent/50',
              )}
            >
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium leading-tight">{parish}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Click a municipality to drill down into parishes
      </div>

      {/* Color scale legend */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>Affordable</span>
        <div className="flex h-2 flex-1 overflow-hidden rounded-full">
          <div className="flex-1" style={{ background: 'rgba(34,197,94,0.85)' }} />
          <div className="flex-1" style={{ background: 'rgba(132,204,22,0.85)' }} />
          <div className="flex-1" style={{ background: 'rgba(234,179,8,0.85)' }} />
          <div className="flex-1" style={{ background: 'rgba(249,115,22,0.85)' }} />
          <div className="flex-1" style={{ background: 'rgba(239,68,68,0.85)' }} />
        </div>
        <span>Expensive</span>
      </div>

      {/* Visual map */}
      <div className="relative rounded-xl border overflow-hidden">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ center: [-9.1, 38.82], scale: 35000 }}
          width={400}
          height={340}
          style={{ width: '100%', height: 'auto' }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => {
                const name: string = geo.properties.name ?? geo.properties.NAME_2 ?? '';
                const stat = statsByName[name];
                const isSelected = drilldown.municipio === name;
                const m2 = stat?.avg_m2 ?? 0;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => setMunicipio(isSelected ? null : name)}
                    onMouseEnter={() =>
                      setTooltip({ name, m2, yoy: stat?.yoy_change ?? 0 })
                    }
                    onMouseLeave={() => setTooltip(null)}
                    style={{
                      default: {
                        fill: getPriceColor(m2, isSelected),
                        stroke: '#ffffff',
                        strokeWidth: isSelected ? 1.5 : 0.5,
                        outline: 'none',
                        cursor: 'pointer',
                        filter: isSelected ? 'drop-shadow(0 0 4px rgba(0,0,0,0.4))' : 'none',
                      },
                      hover: {
                        fill: getPriceColor(m2, true),
                        stroke: '#ffffff',
                        strokeWidth: 1,
                        outline: 'none',
                        cursor: 'pointer',
                      },
                      pressed: {
                        fill: getPriceColor(m2, true),
                        outline: 'none',
                      },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>

        {/* Hover tooltip */}
        {tooltip && (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm text-xs">
            <div className="font-semibold">{tooltip.name}</div>
            {tooltip.m2 > 0 ? (
              <>
                <div className="text-muted-foreground">{getPriceLabel(tooltip.m2)}</div>
                <div
                  className={cn(
                    'font-medium',
                    tooltip.yoy >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                  )}
                >
                  {tooltip.yoy >= 0 ? '+' : ''}{tooltip.yoy.toFixed(1)}% YoY
                </div>
              </>
            ) : (
              <div className="text-muted-foreground">Loading…</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
