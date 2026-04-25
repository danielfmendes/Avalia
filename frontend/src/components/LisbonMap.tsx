import { useEffect, useMemo, useState } from 'react';
import { geoMercator, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { ArrowLeft, Info, Loader2, MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/context/DashboardContext';
import { useGeography } from '@/hooks/useGeography';
import { getFreguesiaStats, getMunicipioStats, type FreguesiaStat } from '@/lib/dataUtils';
import {
  districtMuniNameFrom,
  muniNameFrom,
  MUNI_GEO_URL,
  normalizeName,
  PARISH_GEO_URL,
  parishNameFrom,
  type BoundedFeature,
} from '@/lib/mapUtils';

const MAP_W = 480;
const MAP_H = 520;
const PADDING = 12;

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
const fmtInt = (v: number) => v.toLocaleString('pt-PT');

interface Tip {
  name: string;
  m2: number;
  yoy: number | null;
  listings: number | null;
  clickable: boolean;
  parishHint: 'select' | 'clear' | null;
  /** Cursor position relative to the map container (px). */
  x: number;
  y: number;
}

// Build a Mercator projection that fits the given features into the viewport.
function buildPath(features: BoundedFeature[]) {
  const projection = geoMercator();
  const fc: GeoPermissibleObjects = {
    type: 'FeatureCollection',
    // d3-geo ignores extra props; we just need geometry.
    features: features as unknown as GeoJSON.Feature[],
  } as unknown as GeoPermissibleObjects;
  projection.fitExtent(
    [
      [PADDING, PADDING],
      [MAP_W - PADDING, MAP_H - PADDING],
    ],
    fc,
  );
  return geoPath(projection);
}

export function LisbonMap() {
  const {
    drilldown,
    setMunicipio,
    setFreguesia,
    districtData,
    muniData,
    tipoVenda,
    isDrillLoading,
  } = useDashboard();

  const muniStats = useMemo(() => getMunicipioStats(districtData), [districtData]);
  const muniByName = useMemo(() => {
    const m: Record<string, (typeof muniStats)[number]> = {};
    for (const s of muniStats) {
      m[s.name] = s;
      m[normalizeName(s.name)] = s;
    }
    return m;
  }, [muniStats]);

  // Use muniData (always at full muni scope) so the heatmap stays colored even
  // when the user drills into a single parish — drillData would be just one
  // parish's rows and would collapse the color scale.
  const parishStats = useMemo(
    () => (drilldown.municipio ? getFreguesiaStats(muniData, drilldown.municipio, tipoVenda) : []),
    [muniData, drilldown.municipio, tipoVenda],
  );
  const parishByNormName = useMemo(() => {
    const m = new Map<string, FreguesiaStat>();
    for (const s of parishStats) m.set(normalizeName(s.name), s);
    return m;
  }, [parishStats]);

  // Color scale — drop obviously-bad low rows so €/m² gradient isn't compressed.
  const [levelMin, levelMax] = useMemo(() => {
    const source = drilldown.municipio
      ? parishStats.map(p => p.avg_m2)
      : muniStats.map(m => m.avg_m2);
    const clean = source.filter(v => v >= 500);
    if (clean.length === 0) return [0, 1];
    return [Math.min(...clean), Math.max(...clean)];
  }, [drilldown.municipio, parishStats, muniStats]);

  const districtGeo = useGeography(MUNI_GEO_URL);
  const parishGeo = useGeography(drilldown.municipio ? PARISH_GEO_URL : null);

  // Filter the parish file down to the currently-drilled municipality.
  const parishFeaturesForMuni = useMemo(() => {
    if (!drilldown.municipio || !parishGeo.geography) return [];
    const target = normalizeName(drilldown.municipio);
    return parishGeo.geography.features.filter(f => {
      const muni = muniNameFrom(f.properties as Record<string, unknown>);
      return normalizeName(muni) === target;
    });
  }, [parishGeo.geography, drilldown.municipio]);

  const isDrilled = !!drilldown.municipio;
  const hasParishShapes = isDrilled && parishFeaturesForMuni.length > 0;
  const parishGeoUnavailable =
    isDrilled && (parishGeo.status === 'missing' || parishGeo.status === 'error');
  const showChipFallback =
    isDrilled
    && parishGeo.status !== 'loading'
    && !hasParishShapes
    && parishStats.length > 0;

  // Pick the active feature set + path generator.
  const { activeFeatures, pathGen } = useMemo(() => {
    if (isDrilled && hasParishShapes) {
      const fs = parishFeaturesForMuni;
      return { activeFeatures: fs, pathGen: buildPath(fs) };
    }
    if (districtGeo.geography) {
      const fs = districtGeo.geography.features;
      return { activeFeatures: fs, pathGen: buildPath(fs) };
    }
    return { activeFeatures: [] as BoundedFeature[], pathGen: null };
  }, [isDrilled, hasParishShapes, parishFeaturesForMuni, districtGeo.geography]);

  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => { setTip(null); }, [drilldown.municipio]);

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
                ? (drilldown.freguesia
                    ? 'Click another parish to switch · click outside to clear'
                    : 'Click a parish to compare on the chart')
                : parishGeoUnavailable
                  ? 'Parish shapes file not found — showing data chips'
                  : isDrillLoading
                    ? 'Fetching parish data…'
                    : 'Parishes not yet mapped for this municipality'
              : 'Hover a municipality to inspect · click Lisboa to drill in'}
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Colored by €/m²
        </div>
      </div>

      {/* Map surface — outer wrapper is `relative` (so the tooltip can be
          absolutely positioned against it) but does NOT clip overflow, while
          the inner wrapper handles the visual rounded-corner clipping of the
          SVG. This way the tooltip can extend slightly past the map bounds
          without being cut off. */}
      <div className="relative" onMouseLeave={() => setTip(null)}>
       <div
         className="relative rounded-xl border border-border/70 overflow-hidden bg-gradient-to-br from-muted/30 to-background"
         onClick={(e) => {
           // Click outside any parish path: clear the selection. The path
           // handlers stop propagation implicitly because they handle the
           // click first; this only fires for empty SVG / chrome areas.
           if (drilldown.freguesia && (e.target as HTMLElement).tagName !== 'path') {
             setFreguesia(null);
           }
         }}
       >
        {isDrilled && (
          <button
            onClick={() => setMunicipio(null)}
            className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur hover:bg-background transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to District
          </button>
        )}

        {/* Active-parish chip: persistent, prominent way to see + clear the
            current parish selection without having to find it on the map. */}
        {drilldown.freguesia && (
          <button
            onClick={() => setFreguesia(null)}
            className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-indigo-400/60 bg-indigo-500/15 px-3 py-1.5 text-[11px] font-semibold text-indigo-700 shadow-sm backdrop-blur hover:bg-indigo-500/25 transition-colors dark:border-indigo-400/50 dark:text-indigo-300"
            title="Clear parish selection"
          >
            <span className="h-2 w-2 rounded-full bg-indigo-500 dark:bg-indigo-400" />
            {drilldown.freguesia}
            <X className="h-3 w-3 opacity-70" />
          </button>
        )}

        {(isDrillLoading || (isDrilled && parishGeo.status === 'loading')) && (
          <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </div>
        )}

        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block', width: '100%', height: 'auto' }}
          role="img"
          aria-label={isDrilled ? `${drilldown.municipio} parishes` : 'Lisboa district municipalities'}
        >
          <g>
            {pathGen && activeFeatures.map((feat, idx) => {
              const props = feat.properties as Record<string, unknown>;
              const isParishLayer = isDrilled && hasParishShapes;
              const name = isParishLayer ? parishNameFrom(props) : districtMuniNameFrom(props);
              const stat = isParishLayer
                ? parishByNormName.get(normalizeName(name))
                : (muniByName[name] ?? muniByName[normalizeName(name)]);
              const isClickable = !isDrilled && normalizeName(name) === 'lisboa';
              // At parish layer, only parishes with data are meaningfully
              // selectable — empty shapes have no time series to draw.
              const isParishSelectable = isParishLayer && (stat?.total_rows ?? 0) > 0;
              const isParishSelected   = isParishLayer
                && drilldown.freguesia != null
                && normalizeName(drilldown.freguesia) === normalizeName(name);

              const value = stat?.avg_m2 ?? 0;
              const fill = colorFor(value);
              const d = pathGen(feat as unknown as GeoPermissibleObjects);
              if (!d) return null;

              const isHovered = tip?.name === name;

              const updateTip = (e: React.MouseEvent<SVGPathElement>) => {
                const rect = (e.currentTarget.ownerSVGElement?.parentElement as HTMLElement)
                  ?.getBoundingClientRect();
                const x = rect ? e.clientX - rect.left : e.clientX;
                const y = rect ? e.clientY - rect.top : e.clientY;
                setTip({
                  name,
                  m2: value,
                  yoy: stat?.yoy_change ?? null,
                  listings: stat?.total_rows ?? null,
                  clickable: isClickable,
                  parishHint: isParishSelectable
                    ? (isParishSelected ? 'clear' : 'select')
                    : null,
                  x,
                  y,
                });
              };

              // When a parish is selected, push every other parish back so
              // the focused one really pops. Selected parish gets a thick
              // indigo stroke that matches the chart line color.
              const hasParishFocus = isParishLayer && drilldown.freguesia != null;
              return (
                <path
                  key={`${name}-${idx}`}
                  d={d}
                  fill={fill}
                  fillOpacity={
                    isParishSelected ? 1
                    : hasParishFocus ? 0.35
                    : isHovered ? 1
                    : 0.88
                  }
                  stroke={isParishSelected ? '#6366f1' : '#ffffff'}
                  strokeOpacity={
                    isParishSelected ? 1
                    : hasParishFocus && !isHovered ? 0.45
                    : isHovered ? 1
                    : 0.7
                  }
                  strokeWidth={isParishSelected ? 3 : isHovered ? 1.6 : 1}
                  vectorEffect="non-scaling-stroke"
                  style={{
                    cursor: isParishSelectable || isClickable ? 'pointer' : 'default',
                    pointerEvents: 'all',
                    filter: isParishSelected
                      ? 'drop-shadow(0 2px 6px rgba(99,102,241,0.45))'
                      : undefined,
                  }}
                  onMouseEnter={updateTip}
                  onMouseMove={updateTip}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isClickable) {
                      setMunicipio(name);
                    } else if (isParishSelectable) {
                      // Toggle: clicking the already-selected parish clears the
                      // drilldown back to muni-level (so the user can compare
                      // a different parish without going to the back button).
                      setFreguesia(isParishSelected ? null : name);
                    }
                  }}
                />
              );
            })}
          </g>
        </svg>

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
       </div>

        {/* Tooltip — sits in the OUTER relative wrapper (which doesn't clip)
            so it can extend past the rounded map edges without being cut off.
            Coords are relative to that outer wrapper. */}
        {tip && (
          <div
            className="pointer-events-none absolute z-30 min-w-[160px] rounded-lg border border-border/60 bg-background/95 px-2.5 py-1.5 text-[11px] text-foreground shadow-xl backdrop-blur-sm"
            style={{
              left: tip.x + 14,
              top: tip.y + 14,
              maxWidth: 220,
            }}
          >
            <div className="font-semibold">{tip.name}</div>
            <div className="text-muted-foreground">
              {tip.m2 > 0 ? `${fmtEur(tip.m2)}/m²` : 'No data available'}
            </div>
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
            {tip.listings !== null && tip.listings > 0 && (
              <div className="text-[10px] text-muted-foreground/80">
                {fmtInt(tip.listings)} listings
              </div>
            )}
            {tip.clickable && (
              <div className="mt-1 border-t border-border/40 pt-1 text-[10px] font-medium text-primary/80">
                Click to drill into parishes →
              </div>
            )}
            {tip.parishHint === 'select' && (
              <div className="mt-1 border-t border-border/40 pt-1 text-[10px] font-medium text-primary/80">
                Click to plot on chart →
              </div>
            )}
            {tip.parishHint === 'clear' && (
              <div className="mt-1 border-t border-border/40 pt-1 text-[10px] font-medium text-muted-foreground">
                Click to clear selection
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
