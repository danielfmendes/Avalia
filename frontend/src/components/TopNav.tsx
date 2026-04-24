import { useDashboard } from '@/context/DashboardContext';
import { ModeToggle } from '@/components/mode-toggle';

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-sm shadow-violet-500/30">
        <span className="font-black text-white text-sm tracking-tighter">A</span>
        <span className="absolute inset-0 rounded-lg ring-1 ring-inset ring-white/15" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-bold tracking-tight">Avalia</div>
        <div className="text-[10px] text-muted-foreground/70 -mt-0.5">Real Estate Intelligence</div>
      </div>
    </div>
  );
}

export function TopNav() {
  const { drilldown } = useDashboard();

  const breadcrumb = drilldown.freguesia
    ? `Lisboa › ${drilldown.municipio} › ${drilldown.freguesia}`
    : drilldown.municipio
      ? `Lisboa › ${drilldown.municipio}`
      : 'Lisboa District';

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        <Logo />

        <div className="hidden md:block text-xs text-muted-foreground/60 font-medium">
          {breadcrumb}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
