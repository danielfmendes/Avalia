import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { filterRecords } from '@/lib/dataUtils';
import { useAvaliaData } from '@/hooks/useAvaliaData';
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
  isError: boolean;
  error: string | null;
  reload: () => void;
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

  const { data: allData, isLoading, isError, error, reload } = useAvaliaData();

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
        isLoading, isError, error, reload,
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
