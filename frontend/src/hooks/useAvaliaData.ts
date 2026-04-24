import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HabitacaoRecord } from '@/lib/types';

interface ApiResponse {
  success: boolean;
  data?: HabitacaoRecord[];
  error?: string;
  level?: string;
  count?: number;
}

export type Scope =
  | { level: 'district' }
  | { level: 'municipality'; municipio: string }
  | { level: 'parish'; municipio: string; freguesia: string };

export interface UseAvaliaDataResult {
  data: HabitacaoRecord[];
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  reload: () => void;
  /** The scope that produced the currently-held data — may lag behind the latest
   *  requested scope while a refetch is in flight. Useful for consumers that
   *  need to ignore stale data during transitions. */
  loadedScope: Scope | null;
}

// Simple per-URL cache. Drilling A → B → A should not refetch A.
const CACHE = new Map<string, HabitacaoRecord[]>();

function buildUrl(apiBase: string, scope: Scope, tipoVenda?: 'compra' | 'arrendamento'): string {
  const params = new URLSearchParams();
  params.set('level', scope.level);
  if (scope.level === 'municipality' || scope.level === 'parish') {
    params.set('municipio', scope.municipio);
  }
  if (scope.level === 'parish') {
    params.set('freguesia', scope.freguesia);
  }
  if (tipoVenda) params.set('tipo_venda', tipoVenda);
  return `${apiBase}/api/search?${params.toString()}`;
}

function scopeKey(scope: Scope, tipoVenda?: string): string {
  return JSON.stringify({ scope, tipoVenda });
}

// Pass `scope: null` to idle (no fetch). When a drill only makes sense at one
// level, callers can gate the hook by passing null for the non-applicable one.
export function useAvaliaData(
  scope: Scope | null,
  tipoVenda?: 'compra' | 'arrendamento',
): UseAvaliaDataResult {
  const [data, setData] = useState<HabitacaoRecord[]>(() => {
    if (!scope) return [];
    const key = scopeKey(scope, tipoVenda);
    return CACHE.get(key) ?? [];
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (!scope) return false;
    return !CACHE.has(scopeKey(scope, tipoVenda));
  });
  const [error, setError] = useState<string | null>(null);
  const [loadedScope, setLoadedScope] = useState<Scope | null>(scope);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => {
    // Bypass cache for an explicit reload — evict the key first.
    if (scope) CACHE.delete(scopeKey(scope, tipoVenda));
    setTick(t => t + 1);
  }, [scope, tipoVenda]);

  // Stash the latest request so late-arriving responses can be ignored.
  const requestId = useRef(0);

  const apiBase = useMemo(
    () => (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '',
    [],
  );

  useEffect(() => {
    if (!scope) {
      setData([]);
      setIsLoading(false);
      setError(null);
      setLoadedScope(null);
      return;
    }

    const myRequestId = ++requestId.current;
    const key = scopeKey(scope, tipoVenda);
    const cached = CACHE.get(key);
    if (cached) {
      setData(cached);
      setIsLoading(false);
      setError(null);
      setLoadedScope(scope);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const url = buildUrl(apiBase, scope, tipoVenda);
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
        const json = (await res.json()) as ApiResponse;
        if (!json.success || !Array.isArray(json.data)) {
          throw new Error(json.error ?? 'Malformed API response');
        }
        if (myRequestId !== requestId.current) return; // stale
        CACHE.set(key, json.data);
        setData(json.data);
        setLoadedScope(scope);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        if (myRequestId !== requestId.current) return;
        setError((err as Error).message || 'Failed to load data');
      } finally {
        if (myRequestId === requestId.current) setIsLoading(false);
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope ? scopeKey(scope, tipoVenda) : 'null', tick, apiBase]);

  return { data, isLoading, isError: error !== null, error, reload, loadedScope };
}
