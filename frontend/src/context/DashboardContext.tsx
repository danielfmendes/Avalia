import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { filterRecords } from '@/lib/dataUtils';
import { useAvaliaData, type Scope } from '@/hooks/useAvaliaData';
import type { ChartMetric, DrilldownState, HabitacaoRecord, Page } from '@/lib/types';

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
  /** The slice the active view should render (after drill + tipo filter). */
  filteredData: HabitacaoRecord[];

  /** Aggregate loading states */
  isLoading: boolean;            // initial district load OR drill load
  isDistrictLoading: boolean;
  isDrillLoading: boolean;
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

  // ── District-level: always fetched. Used for muni map coloring + heatmap.
  //    Intentionally does NOT filter by tipoVenda on the server so we can
  //    compute rental-yield (requires both compra + arrendamento) locally.
  const districtScope: Scope = { level: 'district' };
  const districtQ = useAvaliaData(districtScope);

  // ── Drill scope: fires a new API call on every drill change.
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

  // De-dupe by natural key when combining. The API guarantees non-overlap
  // between district slice and drill slice, but a defensive dedupe costs
  // nothing and survives future API changes.
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
    () => filterRecords(allData, tipoVenda, drilldown.municipio, drilldown.freguesia),
    [allData, tipoVenda, drilldown.municipio, drilldown.freguesia],
  );

  const isDistrictLoading = districtQ.isLoading;
  const isDrillLoading = drillQ.isLoading;
  // Block the shell only when district hasn't landed yet — drill loads are
  // rendered as inline/loading indicators so the rest of the dashboard stays.
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
