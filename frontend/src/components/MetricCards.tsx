import { useMemo } from 'react';
import { Home, TrendingUp, Ruler, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboard } from '@/context/DashboardContext';

function formatCurrency(value: number, compact = false): string {
  if (compact && value >= 1_000_000) {
    return `€${(value / 1_000_000).toFixed(2)}M`;
  }
  if (compact && value >= 1_000) {
    return `€${(value / 1_000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatArea(value: number): string {
  return `${Math.round(value)} m²`;
}

interface CardDef {
  title: string;
  icon: React.ReactNode;
  value: string;
  sub: string;
  change: number;
}

export function MetricCards() {
  const { filteredData, tipoVenda, metric } = useDashboard();

  const stats = useMemo(() => {
    const current = filteredData.filter(r => r.mes_ano === '2023-12');
    const prev = filteredData.filter(r => r.mes_ano === '2022-12');

    const wavg = (rs: typeof filteredData, key: 'avg_m2' | 'avg_preco' | 'avg_area') => {
      const wSum = rs.reduce((s, r) => s + r[key] * r.total_rows, 0);
      const total = rs.reduce((s, r) => s + r.total_rows, 0);
      return total > 0 ? wSum / total : 0;
    };

    const totalRows = current.reduce((s, r) => s + r.total_rows, 0);
    const avgArea = wavg(current, 'avg_area');
    const avgM2 = wavg(current, 'avg_m2');
    const avgPreco = wavg(current, 'avg_preco');

    const prevM2 = wavg(prev, 'avg_m2');
    const prevPreco = wavg(prev, 'avg_preco');
    const prevArea = wavg(prev, 'avg_area');
    const prevRows = prev.reduce((s, r) => s + r.total_rows, 0);

    const pctChange = (cur: number, pv: number) => (pv > 0 ? ((cur - pv) / pv) * 100 : 0);

    return {
      totalRows,
      avgArea,
      avgM2,
      avgPreco,
      changeRows: pctChange(totalRows, prevRows),
      changeArea: pctChange(avgArea, prevArea),
      changeM2: pctChange(avgM2, prevM2),
      changePreco: pctChange(avgPreco, prevPreco),
    };
  }, [filteredData]);

  const cards: CardDef[] = [
    {
      title: 'Total Listings',
      icon: <Home className="h-4 w-4" />,
      value: stats.totalRows.toLocaleString('pt-PT'),
      sub: 'Active in Dec 2023',
      change: stats.changeRows,
    },
    {
      title: 'Avg Area',
      icon: <Ruler className="h-4 w-4" />,
      value: formatArea(stats.avgArea),
      sub: 'Per listing',
      change: stats.changeArea,
    },
    {
      title: metric === 'avg_m2'
        ? (tipoVenda === 'compra' ? 'Price / m²' : 'Rent / m² / month')
        : (tipoVenda === 'compra' ? 'Avg Sale Price' : 'Avg Monthly Rent'),
      icon: <TrendingUp className="h-4 w-4" />,
      value: metric === 'avg_m2'
        ? `€${Math.round(stats.avgM2).toLocaleString('pt-PT')}`
        : formatCurrency(stats.avgPreco, true),
      sub: 'YoY vs Dec 2022',
      change: metric === 'avg_m2' ? stats.changeM2 : stats.changePreco,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map(({ title, icon, value, sub, change }) => (
        <Card key={title} className="relative overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm text-muted-foreground font-medium">
              <span>{title}</span>
              <span className="text-foreground/30">{icon}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{value}</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              {change !== 0 && (
                <span
                  className={`flex items-center gap-0.5 font-medium ${
                    change > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {change > 0 ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {Math.abs(change).toFixed(1)}%
                </span>
              )}
              <span>{sub}</span>
            </div>
          </CardContent>
          {/* Subtle accent bar at top */}
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-500/40 via-blue-500/20 to-transparent" />
        </Card>
      ))}
    </div>
  );
}
