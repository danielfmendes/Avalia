// Geometry + identity helpers for driving react-simple-maps.

type Coord = [number, number];

interface Geometry {
  type: string;
  coordinates: unknown;
}

export interface BoundedFeature {
  type?: string;
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

export function boundsToZoom(
  b: LngLatBounds,
  homeSpanDeg: { lng: number; lat: number },
  paddingRatio = 0.85,
): number {
  const midLat = (b.minLat + b.maxLat) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const featLng = Math.max(b.maxLng - b.minLng, 0.0001);
  const featLat = Math.max(b.maxLat - b.minLat, 0.0001) / cosLat;
  const zoomLng = homeSpanDeg.lng / featLng;
  const zoomLat = homeSpanDeg.lat / featLat;
  return Math.max(1, Math.min(zoomLng, zoomLat) * paddingRatio);
}

// Name normalization for robust joins between data and GeoJSON. CAOP uses
// "União das Freguesias de X" and accented forms; data may be shortened.
export function normalizeName(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/^união\s+das\s+freguesias\s+de\s+/i, '')
    .replace(/^uniao\s+das\s+freguesias\s+de\s+/i, '')
    .replace(/^freguesia\s+de\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const MUNI_GEO_URL = '/geodata/lisbon-municipalities.json';

// Single parish file covering ALL municipalities in Distrito de Lisboa.
// Drop one GeoJSON with every parish-feature tagged by its parent municipality
// and every muni drill-down lights up automatically.
export const PARISH_GEO_URL = '/geodata/lisbon-parishes.json';

// Extract the parent municipality name from a parish feature's properties.
// Probes the usual CAOP / naturalearthdata / OSM key names.
export function muniNameFrom(props: Record<string, unknown>): string {
  return (
    (props.NAME_2 as string) ??
    (props.Concelho as string) ??
    (props.municipio as string) ??
    (props.name_2 as string) ??
    (props.concelho as string) ??
    ''
  );
}

export function parishNameFrom(props: Record<string, unknown>): string {
  return (
    (props.Freguesia as string) ??
    (props.freguesia as string) ??
    (props.NAME_3 as string) ??
    (props.Nome_Freg as string) ??
    (props.name as string) ??
    ''
  );
}

export function districtMuniNameFrom(props: Record<string, unknown>): string {
  return (
    (props.name as string) ??
    (props.NAME_2 as string) ??
    (props.Concelho as string) ??
    (props.municipio as string) ??
    ''
  );
}
