export interface HabitacaoRecord {
  mes_ano: string;
  tipo_venda: 'compra' | 'arrendamento';
  tipo_habitacao: string;
  quartos: string;
  distrito: string;
  municipio: string;
  freguesia: string;
  total_rows: number;
  avg_area: number;
  avg_preco: number;
  avg_m2: number;
}

export type Page = 'market-overview';

export interface DrilldownState {
  municipio: string | null;
  freguesia: string | null;
}

export type ChartMetric = 'avg_m2' | 'avg_preco';

export interface ChartPoint {
  mes_ano: string;
  value: number;
  forecast?: boolean;
  lower?: number;
  upper?: number;
}

export interface MunicipioStat {
  name: string;
  avg_m2: number;
  avg_preco: number;
  avg_area: number;
  total_rows: number;
  yoy_change: number;
  rental_yield: number;
}
