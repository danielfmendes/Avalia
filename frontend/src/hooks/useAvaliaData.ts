import { useCallback, useEffect, useState } from 'react';
import type { HabitacaoRecord } from '@/lib/types';

interface ApiResponse {
  success: boolean;
  data?: HabitacaoRecord[];
  error?: string;
}

export interface UseAvaliaDataResult {
  data: HabitacaoRecord[];
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  reload: () => void;
}

export function useAvaliaData(): UseAvaliaDataResult {
  const [data, setData] = useState<HabitacaoRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

    async function run() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiUrl}/api/search`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
        const json = (await res.json()) as ApiResponse;
        if (!json.success || !Array.isArray(json.data)) {
          throw new Error(json.error ?? 'Malformed API response');
        }
        setData(json.data);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message || 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    }

    run();
    return () => controller.abort();
  }, [tick]);

  return { data, isLoading, isError: error !== null, error, reload };
}
