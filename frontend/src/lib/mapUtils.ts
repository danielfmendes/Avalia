// Identity helpers for joining DB rows ↔ GeoJSON features.

interface Geometry {
  type: string;
  coordinates: unknown;
}

export interface BoundedFeature {
  type?: string;
  properties: Record<string, unknown>;
  geometry: Geometry;
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
    (props.designacao_simplificada as string) ??
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
