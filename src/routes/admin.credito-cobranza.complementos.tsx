import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Receipt, Zap, FileWarning, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { emitirComplementoPagoFn, listPagosSinREPFn } from "@/lib/cobranza-fase5.functions";

export const Route = createFileRoute("/admin/credito-cobranza/complementos")({
  head: () => ({ meta: [{ title: "Complementos de pago · Crédito y Cobranza" }] }),
  component: ComplementosPage,
});

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);

function ComplementosPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPagosSinREPFn);
  const emitirFn = useServerFn(emitirComplementoPagoFn);

  const { data = [], isLoading } = useQuery({
    queryKey: ["pagos-sin-rep"],
    queryFn: () => listFn(),
  });

  const emitir = useMutation({
    mutationFn: (pagoId: string) => emitirFn({ data: { pagoId } }),
    onSuccess: () => {
      toast.success("REP timbrado");
      qc.invalidateQueries({ queryKey: ["pagos-sin-rep"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Receipt className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Complementos de pago (REP) pendientes</h2>
        <Badge variant="outline">{(data as any[]).length}</Badge>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (data as any[]).length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay complementos pendientes.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-2">Fecha</th>
                <th className="text-left px-2 py-2">Cliente</th>
                <th className="text-left px-2 py-2">Factura</th>
                <th className="text-right px-2 py-2">Monto</th>
                <th className="text-center px-2 py-2">Estado</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              {(data as any[]).map((p) => (
                <tr key={p.id} className="border-t border-border align-top">
                  <td className="px-2 py-1.5 text-xs whitespace-nowrap">{new Date(p.fecha).toLocaleDateString("es-MX")}</td>
                  <td className="px-2 py-1.5">{p.factura?.cliente?.nombre_comercial || p.factura?.cliente?.razon_social}</td>
                  <td className="px-2 py-1.5 text-xs">{p.factura?.folio}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmtMXN(p.monto)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <Badge variant="outline" className={p.complemento_estado === "error" ? "bg-red-500/10 text-red-600 border-red-500/30" : "bg-yellow-500/10 text-yellow-700 border-yellow-500/30"}>
                      {p.complemento_estado === "error" ? <FileWarning className="h-3 w-3 mr-1" /> : null}
                      {p.complemento_estado}
                    </Badge>
                    {p.complemento_error && (
                      <div className="text-[10px] text-red-600 mt-1 max-w-xs truncate" title={p.complemento_error}>{p.complemento_error}</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Button size="sm" onClick={() => emitir.mutate(p.id)} disabled={emitir.isPending}>
                      <Zap className="h-3 w-3 mr-1" /> Timbrar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Los REP se generan automáticamente al registrar pagos de facturas PPD; esta vista muestra los que fallaron o quedaron pendientes para re-timbrar manualmente.
        <Link to="/admin/facturas" className="ml-1 underline"><ExternalLink className="h-3 w-3 inline" /> Facturación</Link>
      </p>
    </div>
  );
}
