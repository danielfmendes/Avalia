import {HousingTable} from "@/components/HousingTable";
import {ModeToggle} from "@/components/mode-toggle";
import {Building2} from "lucide-react";

export default function App() {
    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-primary/10">
            {/* Decorative background flare */}
            <div
                className="fixed inset-0 -z-10 h-full w-full bg-white dark:bg-slate-950 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]"/>

            <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
                <div className="container max-w-6xl flex h-16 items-center justify-between px-4">
                    <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-primary">
                        <Building2 className="h-6 w-6"/>
                        <span>Lisboa<span className="text-foreground/60 font-light">RealEstate</span></span>
                    </div>
                    <ModeToggle/>
                </div>
            </header>

            <main className="container max-w-6xl py-10 px-4 space-y-12">
                <div className="space-y-4 text-center md:text-left">
                    <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl lg:leading-[1.1]">
                        Real Estate <span className="text-primary">Market Insights</span>
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-[600px] leading-relaxed">
                        Advanced analytics from 65,000+ rental and sale listings across the Lisbon district, processed
                        in real-time.
                    </p>
                </div>

                <section className="space-y-6">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-2xl font-bold tracking-tight">Lisbon City Trends</h2>
                        <p className="text-sm text-muted-foreground">Recent averages per neighborhood</p>
                    </div>
                    <HousingTable/>
                </section>
            </main>

            <footer className="mt-20 border-t py-10 bg-muted/30">
                <div className="container max-w-6xl text-center text-sm text-muted-foreground">
                    Built for Hackathon 2026 • Powered by Cloudflare D1 & Hono
                </div>
            </footer>
        </div>
    );
}