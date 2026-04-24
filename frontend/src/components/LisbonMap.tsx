import { useEffect, useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { ArrowLeft, MapPin, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/context/DashboardContext';
import { getFreguesiaStats, getMunicipioStats } from '@/lib/dataUtils';
import {
  boundsCenter,
  boundsToScale,
  featureBounds,
  type BoundedFeature,
} from '@/lib/mapUtils';

const MUNI_GEO_URL = '/geodata/lisbon-municipalities.json';
const PARISH_GEO_URL = '/geodata/lisbon-parishes.json';

const MAP_W = 480;
const MAP_H = 420;
const DEFAULT_CENTER: [number, number] = [-9.1, 38.82];
const DEFAULT_SCALE = 38000;

function lerpColor(t: number): string {
  // Sequential green → yellow → red for "price intensity".
  // t is 0..1 on the *active level's* min..max.
  const clamped = Math.max(0, Math.min(1, t));
  const stops: Array<[number, [number, number, number]]> = [
    [0.00, [34, 197, 94]],   // emerald
    [0.25, [132, 204, 22]],  // lime
    [0.50, [234, 179, 8]],   // amber
    [0.75, [249, 115, 22]],  // orange
    [1.00, [239, 68, 68]],   // rose
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t1, c1] = stops[i];
    const [t2, c2] = stops[i + 1];
    if (clamped >= t1 && clamped <= t2) {
      const k = (clamped - t1) / (t2 - t1 || 1);
      const r = Math.round(c1[0] + (c2[0] - c1[0]) * k);
      const g = Math.round(c1[1] + (c2[1] - c1[1]) * k);
      const b = Math.round(c1[2] + (c2[2] - c1[2]) * k);
      return `rgb(${r},${g},${b})`;
    }
  }
  return 'rgb(148,163,184)';
}

function fmtEur(v: number): string {
  return `€${Math.round(v).toLocaleString('pt-PT')}`;
}

interface Tip {
  name: string;
  m2: number;
  yoy: number | null;
  x: number;
  y: number;
}

// Probe whether a parish GeoJSON is available. Harmless if it 404s.
function useOptionalGeo(url: string): BoundedFeature[] | null {
  const [features, setFeatures] = useState<BoundedFeature[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (cancelled || !json?.features) return;
        setFeatures(json.features);
      })
      .catch(() => { /* silent — optional asset */ });
    return () => { cancelled = false; };
  }, [url]);
  return features;
}

export function LisbonMap() {
  const { drilldown, setMunicipio, allData, tipoVenda } = useDashboard();

  // Municipality-level stats (for district view and drill-in header).
  const muniStats = useMemo(() => getMunicipioStats(allData), [allData]);
  const muniByName = useMemo(
    () => Object.fromEntries(muniStats.map(s => [s.name, s])),
    [muniStats],
  );

  // Parish-level stats — only when drilled in.
  const parishStats = useMemo(
    () => (drilldown.municipio ? getFreguesiaStats(allData, drilldown.municipio, tipoVenda) : []),
    [allData, drilldown.municipio, tipoVenda],
  );
  const parishByName = useMemo(
    () => Object.fromEntries(parishStats.map(s => [s.name, s])),
    [parishStats],
  );

  // Dynamic color scale — recomputed per level.
  const [levelMin, levelMax] = useMemo(() => {
    const values = drilldown.municipio
      ? parishStats.map(p => p.avg_m2).filter(v => v > 0)
      : muniStats.map(m => m.avg_m2).filter(v => v > 0);
    if (values.length === 0) return [0, 1];
    return [Math.min(...values), Math.max(...values)];
  }, [drilldown.municipio, parishStats, muniStats]);

  // Load municipality GeoJSON just to extract bounds for the selected one.
  const [muniFeatures, setMuniFeatures] = useState<BoundedFeature[]>([]);
  useEffect(() => {
    fetch(MUNI_GEO_URL)
      .then(r => r.json())
      .then(json => setMuniFeatures(json.features ?? []))
      .catch(() => setMuniFeatures([]));
  }, []);

  const optionalParishFeatures = useOptionalGeo(PARISH_GEO_URL);

  const selectedFeature = useMemo(() => {
    if (!drilldown.municipio) return null;
    return muniFeatures.find(f => {
      const p = f.properties as Record<string, string>;
      return (p.name ?? p.NAME_2) === drilldown.municipio;
    }) ?? null;
  }, [muniFeatures, drilldown.municipio]);

  const { center, scale } = useMemo(() => {
    if (!selectedFeature) return { center: DEFAULT_CENTER, scale: DEFAULT_SCALE };
    const b = featureBounds(selectedFeature);
    if (!b) return { center: DEFAULT_CENTER, scale: DEFAULT_SCALE };
    return {
      center: boundsCenter(b),
      scale: boundsToScale(b, Math.min(MAP_W, MAP_H), 0.78),
    };
  }, [selectedFeature]);

  const [tip, setTip] = useState<Tip | null>(null);

  const isDrilled = !!drilldown.municipio;

  // Heuristic: try property keys commonly used for parish names.
  function getParishName(props: Record<string, unknown>): string {
    return (
      (props.name as string) ??
      (props.NAME_3 as string) ??
      (props.Freguesia as string) ??
      (props.freguesia as string) ??
      ''
    );
  }

  // When a parish GeoJSON is available, filter to those inside the selected muni.
  const parishFeatures = useMemo(() => {
    if (!isDrilled || !optionalParishFeatures) return [];
    return optionalParishFeatures.filter(f => {
      const p = f.properties as Record<string, string>;
      const muni = p.NAME_2 ?? p.municipio ?? p.Concelho ?? '';
      return muni === drilldown.municipio;
    });
  }, [isDrilled, optionalParishFeatures, drilldown.municipio]);

  function colorForMuni(name: string): string {
    const stat = muniByName[name];
    const v = stat?.avg_m2 ?? 0;
    if (v <= 0 || levelMax === levelMin) return 'rgba(148,163,184,0.4)';
    return lerpColor((v - levelMin) / (levelMax - levelMin));
  }

  function colorForParish(name: string): string {
    const stat = parishByName[name];
    const v = stat?.avg_m2 ?? 0;
    if (v <= 0 || levelMax === levelMin) return 'rgba(148,163,184,0.4)';
    return lerpColor((v - levelMin) / (levelMax - levelMin));
  }

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium">
            {isDrilled ? `${drilldown.municipio} — parishes` : 'Lisboa District'}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {isDrilled
              ? 'Click a parish to filter the dashboard'
              : 'Click a municipality to drill down'}
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Colored by €/m²
        </div>
      </div>

      {/* Map surface */}
      <div className="relative rounded-xl border border-border/70 overflow-hidden bg-gradient-to-br from-muted/30 to-background">
        {/* Back button overlay */}
        {isDrilled && (
          <button
            onClick={() => setMunicipio(null)}
            className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur hover:bg-background transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to District
          </button>
        )}

        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ center, scale }}
          width={MAP_W}
          height={MAP_H}
          style={{ width: '100%', height: 'auto', transition: 'all 400ms ease' }}
        >
          {/* District view: municipalities only */}
          {!isDrilled && (
            <Geographies geography={MUNI_GEO_URL}>
              {({ geographies }) =>
                geographies.map(geo => {
                  const props = geo.properties as Record<string, string>;
                  const name = props.name ?? props.NAME_2 ?? '';
                  const fill = colorForMuni(name);
                  const stat = muniByName[name];
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={() => setMunicipio(name)}
                      onMouseMove={(e) =>
                        setTip({
                          name,
                          m2: stat?.avg_m2 ?? 0,
                          yoy: stat?.yoy_change ?? null,
                          x: e.clientX,
                          y: e.clientY,
                        })
                      }
                      onMouseLeave={() => setTip(null)}
                      style={{
                        default: {
                          fill,
                          fillOpacity: 0.85,
                          stroke: 'rgba(255,255,255,0.6)',
                          strokeWidth: 0.6,
                          outline: 'none',
                          cursor: 'pointer',
                          transition: 'all 200ms ease',
                        },
                        hover: {
                          fill,
                          fillOpacity: 1,
                          stroke: '#ffffff',
                          strokeWidth: 1.2,
                          outline: 'none',
                          cursor: 'pointer',
                          filter: 'drop-shadow(0 0 6px rgba(0,0,0,0.25))',
                        },
                        pressed: { fill, outline: 'none' },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          )}

          {/* Drilled view: outline of the selected municipality */}
          {isDrilled && selectedFeature && (
            <Geographies geography={{
              type: 'FeatureCollection',
              features: [selectedFeature],
            } as any}>
              {({ geographies }) =>
                geographies.map(geo => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    style={{
                      default: {
                        fill: parishFeatures.length > 0 ? 'transparent' : 'rgba(99,102,241,0.08)',
                        stroke: 'rgba(139,92,246,0.8)',
                        strokeWidth: 1.2,
                        strokeDasharray: parishFeatures.length > 0 ? '0' : '3 3',
                        outline: 'none',
                      },
                      hover: { outline: 'none' },
                      pressed: { outline: 'none' },
                    }}
                  />
                ))
              }
            </Geographies>
          )}

          {/* Drilled view: parish polygons (if geo data available) */}
          {isDrilled && parishFeatures.length > 0 && (
            <Geographies geography={{
              type: 'FeatureCollection',
              features: parishFeatures,
            } as any}>
              {({ geographies }) =>
                geographies.map(geo => {
                  const name = getParishName(geo.properties as Record<string, unknown>);
                  const stat = parishByName[name];
                  const fill = colorForParish(name);
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseMove={(e) =>
                        setTip({
                          name,
                          m2: stat?.avg_m2 ?? 0,
                          yoy: stat?.yoy_change ?? null,
                          x: e.clientX,
                          y: e.clientY,
                        })
                      }
                      onMouseLeave={() => setTip(null)}
                      style={{
                        default: {
                          fill,
                          fillOpacity: 0.88,
                          stroke: 'rgba(255,255,255,0.7)',
                          strokeWidth: 0.5,
                          outline: 'none',
                          cursor: 'pointer',
                          transition: 'all 200ms ease',
                        },
                        hover: {
                          fill,
                          fillOpacity: 1,
                          stroke: '#ffffff',
                          strokeWidth: 1,
                          outline: 'none',
                        },
                        pressed: { fill, outline: 'none' },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          )}
        </ComposableMap>

        {/* Fallback overlay: parish chips over the zoomed muni when no parish GeoJSON */}
        {isDrilled && parishFeatures.length === 0 && parishStats.length > 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-3">
            <div className="pointer-events-auto rounded-xl border border-border/60 bg-background/92 p-3 shadow-lg backdrop-blur-md">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Info className="h-3 w-3" />
                Parish shapes unavailable — showing data chips
              </div>
              <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
                {parishStats
                  .slice()
                  .sort((a, b) => b.avg_m2 - a.avg_m2)
                  .map(p => {
                    const fill = colorForParish(p.name);
                    return (
                      <div
                        key={p.name}
                        className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[10px]"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: fill }}
                        />
                        <span className="flex-1 truncate font-medium">{p.name}</span>
                        <span className="font-mono text-muted-foreground">
                          {p.avg_m2 > 0 ? fmtEur(p.avg_m2) : '—'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* Cursor tooltip */}
        {tip && (
          <div
            className="pointer-events-none fixed z-50 rounded-lg border border-border/60 bg-background/95 px-2.5 py-1.5 text-[11px] shadow-xl backdrop-blur-md"
            style={{ left: tip.x + 12, top: tip.y + 12 }}
          >
            <div className="font-semibold">{tip.name}</div>
            {tip.m2 > 0 ? (
              <div className="text-muted-foreground">{fmtEur(tip.m2)}/m²</div>
            ) : (
              <div className="text-muted-foreground">No data</div>
            )}
            {tip.yoy !== null && tip.yoy !== 0 && (
              <div
                className={cn(
                  'text-[10px] font-medium',
                  tip.yoy >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400',
                )}
              >
                {tip.yoy >= 0 ? '+' : ''}
                {tip.yoy.toFixed(1)}% YoY
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className="tabular-nums">{fmtEur(levelMin)}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full">
          <div className="h-full w-full bg-gradient-to-r from-[rgb(34,197,94)] via-[rgb(234,179,8)] to-[rgb(239,68,68)]" />
        </div>
        <span className="tabular-nums">{fmtEur(levelMax)}</span>
      </div>

      {/* Affordance hint when no drill target */}
      {isDrilled && parishStats.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-3 text-center text-[11px] text-muted-foreground">
          <MapPin className="mx-auto mb-1 h-3.5 w-3.5" />
          No parish-level records for this municipality yet.
        </div>
      )}
    </div>
  );
}
