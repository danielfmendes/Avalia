import { DashboardProvider, useDashboard } from '@/context/DashboardContext';
import { Sidebar } from '@/components/Sidebar';
import { MarketOverview } from '@/pages/MarketOverview';
import { InvestmentHeatmap } from '@/pages/InvestmentHeatmap';
import { AIPredictions } from '@/pages/AIPredictions';

function DashboardContent() {
  const { page } = useDashboard();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Decorative grid background */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_50%,transparent_100%)]" />

      <Sidebar />

      <main className="ml-60 min-h-screen">
        <div className="mx-auto max-w-7xl px-6 py-8">
          {page === 'market-overview' && <MarketOverview />}
          {page === 'investment-heatmap' && <InvestmentHeatmap />}
          {page === 'ai-predictions' && <AIPredictions />}
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
