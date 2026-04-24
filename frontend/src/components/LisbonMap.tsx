import { useEffect, useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { ArrowLeft, Info, Loader2, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/context/DashboardContext';
import { useGeography } from '@/hooks/useGeography';
import { getFreguesiaStats, getMunicipioStats, type FreguesiaStat } from '@/lib/dataUtils';
import {
  boundsCenter,
  boundsToZoom,
  districtMuniNameFrom,
  featureBounds,
  muniNameFrom,
  MUNI_GEO_URL,
  normalizeName,
  PARISH_GEO_URL,
  parishNameFrom,
} from '@/lib/mapUtils';

const MAP_W = 480;
const MAP_H = 420;
const HOME_CENTER: [number, number] = [-9.1, 38.82];
const HOME_SCALE = 38000;
const HOME_SPAN_DEG = { lng: 0.9, lat: 0.55 };

function lerpColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const stops: Array<[number, [number, number, number]]> = [
    [0.00, [34, 197, 94]],
    [0.25, [132, 204, 22]],
    [0.50, [234, 179, 8]],
    [0.75, [249, 115, 22]],
    [1.00, [239, 68, 68]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t1, c1] = stops[i];
    const [t2, c2] = stops[i + 1];
    if (clamped >= t1 && clamped <= t2) {
      const k = (clamped - t1) / (t2 - t1 || 1);
      return `rgb(${Math.round(c1[0] + (c2[0] - c1[0]) * k)},${Math.round(c1[1] + (c2[1] - c1[1]) * k)},${Math.round(c1[2] + (c2[2] - c1[2]) * k)})`;
    }
  }
  return 'rgb(148,163,184)';
}

const fmtEur = (v: number) => `€${Math.round(v).toLocaleString('pt-PT')}`;

interface Tip { name: string; m2: number; yoy: number | null; x: number; y: number; }

export function LisbonMap() {
  const {
    drilldown,
    setMunicipio,
    districtData,
    drillData,
    tipoVenda,
    isDrillLoading,
  } = useDashboard();

  // ── Stats
  // Muni stats always computed from district data. parishStats computed from
  // drillData, which the context refetched specifically for this drill.
  const muniStats = useMemo(() => getMunicipioStats(districtData), [districtData]);
  const muniByName = useMemo(
    () => Object.fromEntries(muniStats.map(s => [s.name, s])),
    [muniStats],
  );

  const parishStats = useMemo(
    () => (drilldown.municipio ? getFreguesiaStats(drillData, drilldown.municipio, tipoVenda) : []),
    [drillData, drilldown.municipio, tipoVenda],
  );
  const parishByNormName = useMemo(() => {
    const m = new Map<string, FreguesiaStat>();
    for (const s of parishStats) m.set(normalizeName(s.name), s);
    return m;
  }, [parishStats]);

  // ── Color scale — dynamic per level
  const [levelMin, levelMax] = useMemo(() => {
    const values = drilldown.municipio
      ? parishStats.map(p => p.avg_m2).filter(v => v > 0)
      : muniStats.map(m => m.avg_m2).filter(v => v > 0);
    if (values.length === 0) return [0, 1];
    return [Math.min(...values), Math.max(...values)];
  }, [drilldown.municipio, parishStats, muniStats]);

  // ── Geographies
  const districtGeo = useGeography(MUNI_GEO_URL);
  const parishGeo = useGeography(drilldown.municipio ? PARISH_GEO_URL : null);

  const selectedMuniFeature = useMemo(() => {
    if (!drilldown.municipio || !districtGeo.geography) return null;
    return (
      districtGeo.geography.features.find(
        f => districtMuniNameFrom(f.properties as Record<string, unknown>) === drilldown.municipio,
      ) ?? null
    );
  }, [districtGeo.geography, drilldown.municipio]);

  // Filter the single parish file down to the currently-drilled municipality.
  const parishFeaturesForMuni = useMemo(() => {
    if (!drilldown.municipio || !parishGeo.geography) return [];
    const target = normalizeName(drilldown.municipio);
    return parishGeo.geography.features.filter(f => {
      const muni = muniNameFrom(f.properties as Record<string, unknown>);
      return normalizeName(muni) === target;
    });
  }, [parishGeo.geography, drilldown.municipio]);

  const { zoomTarget, centerTarget } = useMemo(() => {
    if (!selectedMuniFeature) return { zoomTarget: 1, centerTarget: HOME_CENTER };
    const b = featureBounds(selectedMuniFeature);
    if (!b) return { zoomTarget: 1, centerTarget: HOME_CENTER };
    return {
      zoomTarget: boundsToZoom(b, HOME_SPAN_DEG, 0.78),
      centerTarget: boundsCenter(b),
    };
  }, [selectedMuniFeature]);

  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => { setTip(null); }, [drilldown.municipio]);

  const isDrilled = !!drilldown.municipio;
  const hasParishShapes = isDrilled && parishFeaturesForMuni.length > 0;
  const parishGeoUnavailable =
    isDrilled && (parishGeo.status === 'missing' || parishGeo.status === 'error');
  // Show the chip-list fallback when: (a) file missing, or (b) file loaded
  // but contains no features for this muni (mismatched source).
  const showChipFallback =
    isDrilled
    && parishGeo.status !== 'loading'
    && !hasParishShapes
    && parishStats.length > 0;

  function colorFor(value: number): string {
    if (value <= 0 || levelMax === levelMin) return 'rgba(148,163,184,0.4)';
    return lerpColor((value - levelMin) / (levelMax - levelMin));
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
              ? hasParishShapes
                ? 'Hover a parish to inspect · click outside to return'
                : parishGeoUnavailable
                  ? 'Parish shapes file not found — showing data chips'
                  : isDrillLoading
                    ? 'Fetching parish data…'
                    : 'Parishes not yet mapped for this municipality'
              : 'Click a municipality to drill down'}
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Colored by €/m²
        </div>
      </div>

      {/* Map surface */}
      <div className="relative rounded-xl border border-border/70 overflow-hidden bg-gradient-to-br from-muted/30 to-background">
        {isDrilled && (
          <button
            onClick={() => setMunicipio(null)}
            className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur hover:bg-background transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to District
          </button>
        )}

        {(isDrillLoading || (isDrilled && parishGeo.status === 'loading')) && (
          <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </div>
        )}

        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ center: HOME_CENTER, scale: HOME_SCALE }}
          width={MAP_W}
          height={MAP_H}
          style={{ width: '100%', height: 'auto' }}
        >
          <ZoomableGroup
            center={centerTarget}
            zoom={zoomTarget}
            minZoom={1}
            maxZoom={40}
            translateExtent={[[-100, -100], [MAP_W + 100, MAP_H + 100]]}
          >
            {/* LAYER 1 — District view */}
            {!isDrilled && districtGeo.geography && (
              <Geographies geography={districtGeo.geography}>
                {({ geographies }) =>
                  geographies.map(geo => {
                    const name = districtMuniNameFrom(geo.properties as Record<string, unknown>);
                    const stat = muniByName[name];
                    const fill = colorFor(stat?.avg_m2 ?? 0);
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onClick={() => setMunicipio(name)}
                        onMouseMove={e => setTip({
                          name,
                          m2: stat?.avg_m2 ?? 0,
                          yoy: stat?.yoy_change ?? null,
                          x: e.clientX, y: e.clientY,
                        })}
                        onMouseLeave={() => setTip(null)}
                        style={{
                          default: {
                            fill,
                            fillOpacity: 0.85,
                            stroke: 'rgba(255,255,255,0.6)',
                            strokeWidth: 0.6,
                            outline: 'none',
                            cursor: 'pointer',
                            transition: 'fill-opacity 200ms ease',
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

            {/* LAYER 2 — Selected muni outline backdrop */}
            {isDrilled && selectedMuniFeature && (
              <Geographies geography={{ type: 'FeatureCollection', features: [selectedMuniFeature] } as any}>
                {({ geographies }) =>
                  geographies.map(geo => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      style={{
                        default: {
                          fill: hasParishShapes ? 'transparent' : 'rgba(99,102,241,0.08)',
                          stroke: 'rgba(139,92,246,0.85)',
                          strokeWidth: 1.2,
                          strokeDasharray: hasParishShapes ? '0' : '4 3',
                          vectorEffect: 'non-scaling-stroke',
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

            {/* LAYER 3 — Parish polygons for the drilled muni */}
            {isDrilled && hasParishShapes && (
              <Geographies geography={{ type: 'FeatureCollection', features: parishFeaturesForMuni } as any}>
                {({ geographies }) =>
                  geographies.map(geo => {
                    const rawName = parishNameFrom(geo.properties as Record<string, unknown>);
                    const stat = parishByNormName.get(normalizeName(rawName));
                    const fill = colorFor(stat?.avg_m2 ?? 0);
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onMouseMove={e => setTip({
                          name: rawName,
                          m2: stat?.avg_m2 ?? 0,
                          yoy: stat?.yoy_change ?? null,
                          x: e.clientX, y: e.clientY,
                        })}
                        onMouseLeave={() => setTip(null)}
                        style={{
                          default: {
                            fill,
                            fillOpacity: 0.88,
                            stroke: 'rgba(255,255,255,0.75)',
                            strokeWidth: 0.4,
                            vectorEffect: 'non-scaling-stroke',
                            outline: 'none',
                            cursor: 'pointer',
                            transition: 'fill-opacity 200ms ease',
                          },
                          hover: {
                            fill,
                            fillOpacity: 1,
                            stroke: '#ffffff',
                            strokeWidth: 1,
                            vectorEffect: 'non-scaling-stroke',
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
          </ZoomableGroup>
        </ComposableMap>

        {/* Chip-list fallback */}
        {showChipFallback && (
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-3">
            <div className="pointer-events-auto rounded-xl border border-border/60 bg-background/92 p-3 shadow-lg backdrop-blur-md">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Info className="h-3 w-3" />
                {parishGeoUnavailable
                  ? `lisbon-parishes.json not found — showing data for ${drilldown.municipio}`
                  : `Parish shapes unavailable for ${drilldown.municipio} — showing data chips`}
              </div>
              <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
                {parishStats
                  .slice()
                  .sort((a, b) => b.avg_m2 - a.avg_m2)
                  .map(p => (
                    <div
                      key={p.name}
                      className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[10px]"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorFor(p.avg_m2) }} />
                      <span className="flex-1 truncate font-medium">{p.name}</span>
                      <span className="font-mono text-muted-foreground">
                        {p.avg_m2 > 0 ? fmtEur(p.avg_m2) : '—'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

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
                  tip.yoy >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                )}
              >
                {tip.yoy >= 0 ? '+' : ''}{tip.yoy.toFixed(1)}% YoY
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

      {isDrilled && parishStats.length === 0 && !isDrillLoading && (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-3 text-center text-[11px] text-muted-foreground">
          <MapPin className="mx-auto mb-1 h-3.5 w-3.5" />
          No parish-level records returned for {drilldown.municipio}.
        </div>
      )}
    </div>
  );
}
