import { useEffect, useState } from 'react';
import type { BoundedFeature } from '@/lib/mapUtils';

export type GeoStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error';

export interface GeographyPayload {
  type: 'FeatureCollection';
  features: BoundedFeature[];
}

export interface UseGeographyResult {
  url: string | null;
  geography: GeographyPayload | null;
  status: GeoStatus;
  error: string | null;
}

// Simple in-memory cache so swapping back to a previously-loaded URL is instant.
const CACHE = new Map<string, GeographyPayload>();

// Loads a GeoJSON file from /public by URL. Pass `null` to idle (no network).
// Returns a stable reference to the parsed FeatureCollection so downstream
// Geographies / Geography props don't flicker on re-render.
export function useGeography(url: string | null): UseGeographyResult {
  const [geography, setGeography] = useState<GeographyPayload | null>(
    url ? CACHE.get(url) ?? null : null,
  );
  const [status, setStatus] = useState<GeoStatus>(url ? (CACHE.has(url) ? 'ready' : 'loading') : 'idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setGeography(null);
      setStatus('idle');
      setError(null);
      return;
    }

    // Cache hit — no fetch.
    const cached = CACHE.get(url);
    if (cached) {
      setGeography(cached);
      setStatus('ready');
      setError(null);
      return;
    }

    const controller = new AbortController();
    setStatus('loading');
    setError(null);

    fetch(url, { signal: controller.signal })
      .then(async res => {
        if (res.status === 404) {
          setStatus('missing');
          setGeography(null);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
        const json = (await res.json()) as GeographyPayload;
        if (!json || !Array.isArray(json.features)) {
          throw new Error('Malformed GeoJSON payload');
        }
        CACHE.set(url, json);
        setGeography(json);
        setStatus('ready');
      })
      .catch(err => {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message || 'Failed to load geography');
        setStatus('error');
      });

    return () => controller.abort();
  }, [url]);

  return { url, geography, status, error };
}
