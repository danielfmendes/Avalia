import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { filterRecords } from '@/lib/dataUtils';
import { useAvaliaData, type Scope } from '@/hooks/useAvaliaData';
import { PAGE_PATHS, pathToPage, type ChartMetric, type DrilldownState, type HabitacaoRecord, type Page } from '@/lib/types';

interface DashboardContextValue {
  page: Page;
  setPage: (page: Page) => void;

  drilldown: DrilldownState;
  setMunicipio: (municipio: string | null) => void;
  setFreguesia: (freguesia: string | null) => void;
  resetDrilldown: () => void;

  /** Muni-level aggregate rows (always loaded). Drives district map + heatmap. */
  districtData: HabitacaoRecord[];
  /** Scope-specific rows for current drill. Empty at top level. */
  drillData: HabitacaoRecord[];
  /** Convenience: districtData ∪ drillData, de-duplicated. */
  allData: HabitacaoRecord[];
  /** The slice the active view should render (after drill + tipo + filter). */
  filteredData: HabitacaoRecord[];

  /** Aggregate loading states */
  isLoading: boolean;
  isDistrictLoading: boolean;
  isDrillLoading: boolean;
  isError: boolean;
  error: string | null;
  reload: () => void;

  tipoVenda: 'compra' | 'arrendamento';
  setTipoVenda: (tipo: 'compra' | 'arrendamento') => void;
  metric: ChartMetric;
  setMetric: (metric: ChartMetric) => void;

  /** Room-type filter — null means all types */
  quartos: string | null;
  setQuartos: (q: string | null) => void;
  /** Area range filter — null means unbounded */
  minArea: number | null;
  maxArea: number | null;
  setAreaRange: (min: number | null, max: number | null) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [page, setPageState] = useState<Page>(() =>
    typeof window !== 'undefined' ? pathToPage(window.location.pathname) : 'market-overview',
  );

  // Page setter writes to the URL; popstate keeps state in sync with back/forward.
  const setPage = (next: Page) => {
    setPageState(next);
    if (typeof window !== 'undefined') {
      const path = PAGE_PATHS[next];
      if (window.location.pathname !== path) {
        window.history.pushState({}, '', path);
      }
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPop = () => setPageState(pathToPage(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const [drilldown, setDrilldown] = useState<DrilldownState>({ municipio: null, freguesia: null });
  const [tipoVenda, setTipoVenda] = useState<'compra' | 'arrendamento'>('compra');
  const [metric, setMetric] = useState<ChartMetric>('avg_m2');
  const [quartos, setQuartos] = useState<string | null>(null);
  const [minArea, setMinArea] = useState<number | null>(null);
  const [maxArea, setMaxArea] = useState<number | null>(null);

  function setAreaRange(min: number | null, max: number | null) {
    setMinArea(min);
    setMaxArea(max);
  }

  // ── District-level: always fetched. Used for muni map coloring.
  //    No tipoVenda filter so we can compute rental-yield locally.
  const districtScope: Scope = { level: 'district' };
  const districtQ = useAvaliaData(districtScope);

  // ── Drill scope: fires on every drill change.
  const drillScope: Scope | null = useMemo(() => {
    if (drilldown.freguesia && drilldown.municipio) {
      return { level: 'parish', municipio: drilldown.municipio, freguesia: drilldown.freguesia };
    }
    if (drilldown.municipio) {
      return { level: 'municipality', municipio: drilldown.municipio };
    }
    return null;
  }, [drilldown.municipio, drilldown.freguesia]);

  const drillQ = useAvaliaData(drillScope);

  const districtData = districtQ.data;
  const drillData = drillQ.data;

  const allData = useMemo<HabitacaoRecord[]>(() => {
    const seen = new Set<string>();
    const out: HabitacaoRecord[] = [];
    const push = (r: HabitacaoRecord) => {
      const k = `${r.mes_ano}|${r.tipo_venda}|${r.tipo_habitacao}|${r.quartos}|${r.municipio}|${r.freguesia}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push(r);
    };
    for (const r of districtData) push(r);
    for (const r of drillData) push(r);
    return out;
  }, [districtData, drillData]);

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
    () => filterRecords(
      allData,
      tipoVenda,
      drilldown.municipio,
      drilldown.freguesia,
      quartos,
      minArea,
      maxArea,
    ),
    [allData, tipoVenda, drilldown.municipio, drilldown.freguesia, quartos, minArea, maxArea],
  );

  const isDistrictLoading = districtQ.isLoading;
  const isDrillLoading = drillQ.isLoading;
  const isLoading = districtData.length === 0 && isDistrictLoading;
  const isError = districtQ.isError || drillQ.isError;
  const error = districtQ.error ?? drillQ.error ?? null;

  function reload() {
    districtQ.reload();
    drillQ.reload();
  }

  return (
    <DashboardContext.Provider
      value={{
        page, setPage,
        drilldown, setMunicipio, setFreguesia, resetDrilldown,
        districtData, drillData, allData, filteredData,
        isLoading, isDistrictLoading, isDrillLoading,
        isError, error, reload,
        tipoVenda, setTipoVenda,
        metric, setMetric,
        quartos, setQuartos,
        minArea, maxArea, setAreaRange,
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
