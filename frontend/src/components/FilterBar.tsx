import { cn } from '@/lib/utils';
import { useDashboard } from '@/context/DashboardContext';

const ROOM_OPTIONS: Array<{ label: string; value: string | null }> = [
  { label: 'All', value: null },
  { label: 'T0', value: 'T0' },
  { label: 'T1', value: 'T1' },
  { label: 'T2', value: 'T2' },
  { label: 'T3', value: 'T3' },
  { label: 'T4+', value: 'T4+' },
];

const AREA_OPTIONS: Array<{ label: string; min: number | null; max: number | null }> = [
  { label: 'Any', min: null, max: null },
  { label: '< 50 m²', min: null, max: 50 },
  { label: '50–100 m²', min: 50, max: 100 },
  { label: '100–150 m²', min: 100, max: 150 },
  { label: '> 150 m²', min: 150, max: null },
];

function PillGroup<T>({
  options,
  isActive,
  onSelect,
  getLabel,
}: {
  options: T[];
  isActive: (opt: T) => boolean;
  onSelect: (opt: T) => void;
  getLabel: (opt: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt, i) => (
        <button
          key={i}
          onClick={() => onSelect(opt)}
          className={cn(
            'rounded-full border px-3 py-1 text-[11px] font-medium transition-colors',
            isActive(opt)
              ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
              : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:border-border',
          )}
        >
          {getLabel(opt)}
        </button>
      ))}
    </div>
  );
}

export function FilterBar() {
  const {
    tipoVenda, setTipoVenda,
    quartos, setQuartos,
    minArea, maxArea, setAreaRange,
  } = useDashboard();

  return (
    <div className="flex flex-wrap items-end gap-5 rounded-2xl border border-border/60 bg-card/80 p-4 backdrop-blur-sm dark:bg-card/40">

      {/* Transaction type */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Type
        </span>
        <div className="flex rounded-full border border-border/60 bg-muted/30 p-0.5">
          {(['compra', 'arrendamento'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTipoVenda(t)}
              className={cn(
                'rounded-full px-4 py-1 text-[11px] font-semibold transition-colors',
                tipoVenda === t
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/40'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'compra' ? 'Buy' : 'Rent'}
            </button>
          ))}
        </div>
      </div>

      <div className="h-8 w-px bg-border/40 hidden sm:block" />

      {/* Rooms */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Rooms
        </span>
        <PillGroup
          options={ROOM_OPTIONS}
          isActive={opt => opt.value === quartos}
          onSelect={opt => setQuartos(opt.value)}
          getLabel={opt => opt.label}
        />
      </div>

      <div className="h-8 w-px bg-border/40 hidden sm:block" />

      {/* Area */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Area
        </span>
        <PillGroup
          options={AREA_OPTIONS}
          isActive={opt => opt.min === minArea && opt.max === maxArea}
          onSelect={opt => setAreaRange(opt.min, opt.max)}
          getLabel={opt => opt.label}
        />
      </div>
    </div>
  );
}
