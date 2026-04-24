import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { filterRecords } from '@/lib/dataUtils';
import type { ChartMetric, DrilldownState, HabitacaoRecord, Page } from '@/lib/types';

interface DashboardContextValue {
  page: Page;
  setPage: (page: Page) => void;
  drilldown: DrilldownState;
  setMunicipio: (municipio: string | null) => void;
  setFreguesia: (freguesia: string | null) => void;
  resetDrilldown: () => void;
  filteredData: HabitacaoRecord[];
  allData: HabitacaoRecord[];
  isLoading: boolean;
  tipoVenda: 'compra' | 'arrendamento';
  setTipoVenda: (tipo: 'compra' | 'arrendamento') => void;
  metric: ChartMetric;
  setMetric: (metric: ChartMetric) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>('market-overview');
  const [drilldown, setDrilldown] = useState<DrilldownState>({ municipio: null, freguesia: null });
  const [tipoVenda, setTipoVenda] = useState<'compra' | 'arrendamento'>('compra');
  const [metric, setMetric] = useState<ChartMetric>('avg_m2');
  const [allData, setAllData] = useState<HabitacaoRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
    fetch(`${apiUrl}/api/search`)
      .then(r => r.json())
      .then((json: { success: boolean; data: HabitacaoRecord[] }) => {
        if (json.success) setAllData(json.data);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  function setMunicipio(municipio: string | null) {
    setDrilldown({ municipio, freguesia: null });
  }

  function setFreguesia(freguesia: string | null) {
    setDrilldown(d => ({ ...d, freguesia }));
  }

  function resetDrilldown() {
    setDrilldown({ municipio: null, freguesia: null });
  }

  const filteredData = useMemo(
    () => filterRecords(allData, tipoVenda, drilldown.municipio, drilldown.freguesia),
    [allData, tipoVenda, drilldown.municipio, drilldown.freguesia],
  );

  return (
    <DashboardContext.Provider
      value={{
        page, setPage,
        drilldown, setMunicipio, setFreguesia, resetDrilldown,
        filteredData,
        allData,
        isLoading,
        tipoVenda, setTipoVenda,
        metric, setMetric,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}
