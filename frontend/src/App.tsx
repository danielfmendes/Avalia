import { DashboardProvider, useDashboard } from '@/context/DashboardContext';
import { TopNav } from '@/components/TopNav';
import { MarketOverview } from '@/pages/MarketOverview';
import { AIPredictions } from '@/pages/AIPredictions';
import { Compare } from '@/pages/Compare';
import { Rooms } from '@/pages/Rooms';
import { Affordability } from '@/pages/Affordability';
import { TimeMachine } from '@/pages/TimeMachine';
import { AlertTriangle, Loader2 } from 'lucide-react';

function LoadingShell() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <div className="text-xs tracking-wide uppercase">Loading market data…</div>
      </div>
    </div>
  );
}

function ErrorShell({ error, reload }: { error: string; reload: () => void }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-destructive/10 p-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Unable to load data</div>
            <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{error}</div>
            <button
              onClick={reload}
              className="mt-3 rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageRouter() {
  const { page } = useDashboard();
  switch (page) {
    case 'market-overview': return <MarketOverview />;
    case 'ai-predictions':  return <AIPredictions />;
    case 'compare':         return <Compare />;
    case 'rooms':           return <Rooms />;
    case 'affordability':   return <Affordability />;
    case 'time-machine':    return <TimeMachine />;
    default:                return <MarketOverview />;
  }
}

function DashboardContent() {
  const { isLoading, isError, error, reload } = useDashboard();

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {/* Ambient gradient backdrop */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-500/10 via-violet-500/8 to-fuchsia-500/10 blur-3xl dark:from-indigo-500/20 dark:via-violet-500/10 dark:to-fuchsia-500/20" />
        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,#000_50%,transparent_100%)]" />
      </div>

      <TopNav />

      <main>
        <div className="mx-auto max-w-7xl px-6 py-8">
          {isLoading ? (
            <LoadingShell />
          ) : isError ? (
            <ErrorShell error={error ?? 'Unknown error'} reload={reload} />
          ) : (
            <PageRouter />
          )}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <DashboardProvider>
      <DashboardContent />
    </DashboardProvider>
  );
}
