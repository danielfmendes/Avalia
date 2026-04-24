import {useEffect, useState} from "react";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {Badge} from "@/components/ui/badge";
import {AlertCircle, Loader2} from "lucide-react";

interface HousingData {
    mes_ano: string;
    freguesia: string;
    total_rows: number;
    avg_preco: number;
    tipo_venda: string;
}

export function HousingTable() {
    const [data, setData] = useState<HousingData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "");

    useEffect(() => {
        if (!apiUrl) {
            setError("VITE_API_URL is missing. Ensure it is set in GitHub Secrets and passed in the workflow.");
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            try {
                const response = await fetch(`${apiUrl}/api/search?municipio=Lisboa`);

                if (!response.ok) {
                    throw new Error(`Server responded with ${response.status}`);
                }

                const json = await response.json();

                if (json.success) {
                    setData(json.data.slice(0, 10));
                } else {
                    setError(json.error || "API returned an unsuccessful response.");
                }
            } catch (err: any) {
                setError(err.message || "Failed to connect to the API.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [apiUrl]);

    if (loading) {
        return (
            <div
                className="rounded-xl border bg-card p-8 flex flex-col items-center justify-center gap-4 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary"/>
                <p className="text-sm font-medium animate-pulse">Querying D1 database...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div
                className="flex items-center gap-3 p-6 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive">
                <AlertCircle className="h-5 w-5 shrink-0"/>
                <div className="text-sm font-medium">Deployment Error: {error}</div>
            </div>
        );
    }

    return (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="py-4 px-6">Period</TableHead>
                            <TableHead>Parish</TableHead>
                            <TableHead className="hidden md:table-cell">Type</TableHead>
                            <TableHead className="text-right px-6">Avg Price</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                                    No records found for the current selection.
                                </TableCell>
                            </TableRow>
                        ) : (
                            data.map((row, i) => (
                                <TableRow key={i} className="hover:bg-muted/30 transition-colors">
                                    <TableCell className="font-mono text-xs text-muted-foreground px-6">
                                        {row.mes_ano}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-semibold text-sm">{row.freguesia}</span>
                                            <span
                                                className="text-[10px] md:hidden text-muted-foreground uppercase tracking-wider">
                                                {row.tipo_venda}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell">
                                        <Badge
                                            variant={row.tipo_venda === 'venda' ? 'default' : 'secondary'}
                                            className="capitalize text-[10px]"
                                        >
                                            {row.tipo_venda}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-sm text-primary px-6">
                                        {new Intl.NumberFormat("pt-PT", {
                                            style: "currency",
                                            currency: "EUR",
                                            maximumFractionDigits: 0,
                                        }).format(row.avg_preco)}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}