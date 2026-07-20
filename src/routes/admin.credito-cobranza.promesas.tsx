import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, XCircle, HandCoins } from "lucide-react";

export const Route = createFileRoute("/admin/credito-cobranza/promesas")({
  component: PromesasPage,
});

const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

function PromesasPage() {
  const qc = useQueryClient();
  const [estado, setEstado] = useState<string>("pendiente");

  const { data = [], isLoading } = useQuery({
    queryKey: ["promesas", estado],
    queryFn: async () => {
      let q = supabase
        .from("cobranza_promesas_pago" as any)
        .select("id, cliente_id, factura_id, monto, fecha_promesa, estado, monto_cumplido, notas, created_at, clientes(razon_social, nombre_comercial), facturas(folio)")
        .order("fecha_promesa", { ascending: true })
        .limit(500);
      if (estado !== "todas") q = q.eq("estado", estado);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const updateEstado = useMutation({
    mutationFn: async ({ id, estado, monto_cumplido }: { id: string; estado: string; monto_cumplido?: number }) => {
      const { error } = await supabase.from("cobranza_promesas_pago" as any).update({
        estado,
        cumplida_at: estado === "cumplida" ? new Date().toISOString() : null,
        monto_cumplido: monto_cumplido ?? 0,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Promesa actualizada");
      qc.invalidateQueries({ queryKey: ["promesas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold flex items-center gap-2"><HandCoins className="h-4 w-4 text-primary" /> Promesas de pago</h2>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pendiente">Pendientes</SelectItem>
            <SelectItem value="cumplida">Cumplidas</SelectItem>
            <SelectItem value="incumplida">Incumplidas</SelectItem>
            <SelectItem value="cancelada">Canceladas</SelectItem>
            <SelectItem value="todas">Todas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-2 py-2">Fecha promesa</th>
              <th className="text-left px-2 py-2">Cliente</th>
              <th className="text-left px-2 py-2">Factura</th>
              <th className="text-right px-2 py-2">Monto</th>
              <th className="text-center px-2 py-2">Estado</th>
              <th className="text-center px-2 py-2 w-40">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Cargando…</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Sin promesas.</td></tr>
            ) : data.map((p: any) => {
              const vencida = p.estado === "pendiente" && p.fecha_promesa < today;
              return (
                <tr key={p.id} className="border-t border-border">
                  <td className={`px-2 py-1.5 text-xs ${vencida ? "text-red-500 font-semibold" : ""}`}>
                    {p.fecha_promesa}
                  </td>
                  <td className="px-2 py-1.5">
                    <Link to="/admin/credito-cobranza/clientes/$id" params={{ id: p.cliente_id }} className="hover:underline">
                      {p.clientes?.nombre_comercial || p.clientes?.razon_social}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs">{p.facturas?.folio || "—"}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{mxn(Number(p.monto))}</td>
                  <td className="px-2 py-1.5 text-center">
                    <Badge variant="outline" className="capitalize">{p.estado}</Badge>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {p.estado === "pendiente" && (
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" variant="outline" className="h-7 gap-1"
                          onClick={() => updateEstado.mutate({ id: p.id, estado: "cumplida", monto_cumplido: Number(p.monto) })}>
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Cumplida
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 gap-1"
                          onClick={() => updateEstado.mutate({ id: p.id, estado: "incumplida" })}>
                          <XCircle className="h-3 w-3 text-red-500" /> Incumplida
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
