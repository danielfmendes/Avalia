import type { HabitacaoRecord, ChartPoint, MunicipioStat } from './types';

export function filterRecords(
  allData: HabitacaoRecord[],
  tipoVenda: 'compra' | 'arrendamento',
  municipio: string | null,
  freguesia: string | null,
  quartos?: string | null,
  minArea?: number | null,
  maxArea?: number | null,
): HabitacaoRecord[] {
  const muniLower = municipio?.toLowerCase();

  const geoPass = (r: HabitacaoRecord): boolean => {
    if (freguesia) {
      return r.municipio.toLowerCase() === muniLower && r.freguesia === freguesia;
    }
    if (municipio) {
      // Prefer the pre-aggregated grouped rows; if none exist for this muni
      // (parish-only data), fall through to all parish rows below.
      return r.municipio.toLowerCase() === muniLower && r.freguesia === 'Grouped at Municipio level';
    }
    return r.freguesia === 'Grouped at Municipio level';
  };

  const extraPass = (r: HabitacaoRecord): boolean => {
    if (quartos) {
      if (quartos === 'T4+') {
        const n = parseInt(r.quartos.replace(/\D/g, ''), 10);
        if (isNaN(n) || n < 4) return false;
      } else if (r.quartos !== quartos) {
        return false;
      }
    }
    if (minArea != null && r.avg_area < minArea) return false;
    if (maxArea != null && r.avg_area > maxArea) return false;
    return true;
  };

  const primary = allData.filter(r => r.tipo_venda === tipoVenda && geoPass(r) && extraPass(r));

  // Fallback: if we drilled into a municipality but it has no grouped rows
  // (e.g. Lisboa whose data is parish-level only), use parish rows instead.
  if (primary.length === 0 && municipio && !freguesia) {
    return allData.filter(
      r => r.tipo_venda === tipoVenda
        && r.municipio.toLowerCase() === muniLower
        && r.freguesia !== 'Grouped at Municipio level'
        && extraPass(r),
    );
  }

  return primary;
}

export function aggregateByMonth(
  records: HabitacaoRecord[],
  metric: 'avg_m2' | 'avg_preco',
): ChartPoint[] {
  const map = new Map<string, { wSum: number; totalRows: number }>();

  for (const r of records) {
    const existing = map.get(r.mes_ano) ?? { wSum: 0, totalRows: 0 };
    map.set(r.mes_ano, {
      wSum: existing.wSum + r[metric] * r.total_rows,
      totalRows: existing.totalRows + r.total_rows,
    });
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes_ano, { wSum, totalRows }]) => ({
      mes_ano,
      value: totalRows > 0 ? wSum / totalRows : 0,
    }));
}

export function wavg(
  rs: HabitacaoRecord[],
  key: 'avg_m2' | 'avg_preco' | 'avg_area',
): number {
  const wSum = rs.reduce((s, r) => s + r[key] * r.total_rows, 0);
  const total = rs.reduce((s, r) => s + r.total_rows, 0);
  return total > 0 ? wSum / total : 0;
}

// Returns the newest mes_ano in a record set, or null if empty.
export function latestMonth(records: HabitacaoRecord[]): string | null {
  let max: string | null = null;
  for (const r of records) {
    if (max === null || r.mes_ano > max) max = r.mes_ano;
  }
  return max;
}

// Subtract 12 months from a mes_ano string ("YYYY-MM"), returning a new mes_ano.
export function minusYear(mesAno: string): string {
  const [y, m] = mesAno.split('-').map(Number);
  return `${y - 1}-${String(m).padStart(2, '0')}`;
}

export function getMunicipioStats(allData: HabitacaoRecord[]): MunicipioStat[] {
  const municipios = [...new Set(allData.map(r => r.municipio))];

  return municipios.map(name => {
    const base = (tv: string, year: string) =>
      allData.filter(
        r => r.municipio === name
          && r.freguesia === 'Grouped at Municipio level'
          && r.tipo_venda === tv
          && r.mes_ano.startsWith(year),
      );

    const compra2023 = base('compra', '2023');
    const compra2022 = base('compra', '2022');
    const arrend2023 = base('arrendamento', '2023');

    const m2_2023 = wavg(compra2023, 'avg_m2');
    const m2_2022 = wavg(compra2022, 'avg_m2');
    const rentM2 = wavg(arrend2023, 'avg_m2');

    return {
      name,
      avg_m2: m2_2023,
      avg_preco: wavg(compra2023, 'avg_preco'),
      avg_area: wavg(compra2023, 'avg_area'),
      total_rows: compra2023.reduce((s, r) => s + r.total_rows, 0),
      yoy_change: m2_2022 > 0 ? ((m2_2023 - m2_2022) / m2_2022) * 100 : 0,
      rental_yield: m2_2023 > 0 ? (rentM2 * 12) / m2_2023 * 100 : 0,
    };
  });
}

// Parish-level stats shaped identically to MunicipioStat so the Compare /
// Affordability pages can feed parish rows into the same matrix, cards, and
// charts without branching. Expects records that include parish rows for
// `municipio` (e.g. the municipality-drill response for Lisboa).
export function getParishStats(
  allData: HabitacaoRecord[],
  municipio: string,
): MunicipioStat[] {
  const scope = allData.filter(
    r => r.municipio === municipio && r.freguesia !== 'Grouped at Municipio level',
  );
  const parishes = [...new Set(scope.map(r => r.freguesia))];

  return parishes.map(name => {
    const base = (tv: string, year: string) =>
      scope.filter(
        r => r.freguesia === name && r.tipo_venda === tv && r.mes_ano.startsWith(year),
      );

    const compra2023 = base('compra', '2023');
    const compra2022 = base('compra', '2022');
    const arrend2023 = base('arrendamento', '2023');

    const m2_2023 = wavg(compra2023, 'avg_m2');
    const m2_2022 = wavg(compra2022, 'avg_m2');
    const rentM2 = wavg(arrend2023, 'avg_m2');

    return {
      name,
      avg_m2: m2_2023,
      avg_preco: wavg(compra2023, 'avg_preco'),
      avg_area: wavg(compra2023, 'avg_area'),
      total_rows: compra2023.reduce((s, r) => s + r.total_rows, 0),
      yoy_change: m2_2022 > 0 ? ((m2_2023 - m2_2022) / m2_2022) * 100 : 0,
      rental_yield: m2_2023 > 0 ? (rentM2 * 12) / m2_2023 * 100 : 0,
    };
  });
}

// Parish-level stats within a municipality — used for map drill-down coloring.
export interface FreguesiaStat {
  name: string;
  avg_m2: number;
  avg_preco: number;
  yoy_change: number;
  total_rows: number;
}

export function getFreguesiaStats(
  allData: HabitacaoRecord[],
  municipio: string,
  tipoVenda: 'compra' | 'arrendamento' = 'compra',
): FreguesiaStat[] {
  const scoped = allData.filter(
    r => r.municipio === municipio
      && r.tipo_venda === tipoVenda
      && r.freguesia !== 'Grouped at Municipio level',
  );
  const names = [...new Set(scoped.map(r => r.freguesia))];

  return names.map(name => {
    const rs = scoped.filter(r => r.freguesia === name);
    const latest = latestMonth(rs);
    const latestYear = latest?.slice(0, 4) ?? '';
    const prevYear = latestYear ? `${parseInt(latestYear) - 1}` : '';

    const curRs = rs.filter(r => r.mes_ano.startsWith(latestYear));
    // Only compare against the same calendar months observed in `curRs` —
    // otherwise a partial-2024 (e.g. Jan–Mar) is benchmarked against full 2023
    // and the YoY skews along seasonal patterns.
    const curMonths = new Set(curRs.map(r => r.mes_ano.slice(5, 7)));
    const prevRs = rs.filter(
      r => r.mes_ano.startsWith(prevYear) && curMonths.has(r.mes_ano.slice(5, 7)),
    );

    const m2 = wavg(curRs, 'avg_m2');
    const prevM2 = wavg(prevRs, 'avg_m2');

    return {
      name,
      avg_m2: m2,
      avg_preco: wavg(curRs, 'avg_preco'),
      yoy_change: prevM2 > 0 ? ((m2 - prevM2) / prevM2) * 100 : 0,
      total_rows: curRs.reduce((s, r) => s + r.total_rows, 0),
    };
  });
}

export function getFreguesias(allData: HabitacaoRecord[], municipio: string): string[] {
  return [
    ...new Set(
      allData
        .filter(r => r.municipio === municipio && r.freguesia !== 'Grouped at Municipio level')
        .map(r => r.freguesia),
    ),
  ];
}

export function generateForecast(historicalPoints: ChartPoint[]): ChartPoint[] {
  const recent = historicalPoints.slice(-18);
  if (recent.length < 2) return [];

  const n = recent.length;
  const xs = recent.map((_, i) => i);
  const ys = recent.map(p => p.value);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  const slope =
    xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0) /
    xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
  const intercept = yMean - slope * xMean;

  const lastMesAno = recent[recent.length - 1].mes_ano;
  const [lastYear, lastMonth] = lastMesAno.split('-').map(Number);

  return Array.from({ length: 12 }, (_, i) => {
    const projectedMonth = lastMonth + i + 1;
    const year = lastYear + Math.floor((projectedMonth - 1) / 12);
    const month = ((projectedMonth - 1) % 12) + 1;
    const mes_ano = `${year}-${String(month).padStart(2, '0')}`;
    const value = intercept + slope * (n + i);
    const uncertainty = Math.abs(value) * 0.015 * (i + 1);
    return { mes_ano, value, lower: value - uncertainty, upper: value + uncertainty, forecast: true };
  });
}
