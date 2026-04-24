// Geometry helpers for driving react-simple-maps zoom / centering.
// We can't use d3's bounds helpers here without an extra dep, so we walk
// coordinates directly from GeoJSON features.

type Coord = [number, number];

interface Geometry {
  type: string;
  coordinates: unknown;
}

export interface BoundedFeature {
  properties: Record<string, unknown>;
  geometry: Geometry;
}

function* iterCoords(coords: unknown): Generator<Coord> {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === 'number') {
    yield coords as Coord;
    return;
  }
  for (const c of coords) yield* iterCoords(c);
}

export interface LngLatBounds {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

export function featureBounds(feature: BoundedFeature): LngLatBounds | null {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  let touched = false;
  for (const [lng, lat] of iterCoords(feature.geometry.coordinates)) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    touched = true;
  }
  if (!touched) return null;
  return { minLng, maxLng, minLat, maxLat };
}

export function boundsCenter(b: LngLatBounds): Coord {
  return [(b.minLng + b.maxLng) / 2, (b.minLat + b.maxLat) / 2];
}

// Pick a scale for geoMercator such that the bbox roughly fits the viewport.
// viewportPx is the smaller dimension of the map SVG.
export function boundsToScale(
  b: LngLatBounds,
  viewportPx: number,
  paddingRatio = 0.85,
): number {
  const lngSpan = Math.max(b.maxLng - b.minLng, 0.0001);
  const latSpan = Math.max(b.maxLat - b.minLat, 0.0001);
  const midLat = (b.minLat + b.maxLat) / 2;
  // For geoMercator, 1 unit of "scale" ≈ 1 radian. Width in radians at a given
  // longitude is just (deg * π / 180); height picks up a cos(lat) squish.
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const lngRad = (lngSpan * Math.PI) / 180;
  const latRad = (latSpan * Math.PI) / 180 / cosLat;
  const span = Math.max(lngRad, latRad);
  return (viewportPx * paddingRatio) / span;
}
