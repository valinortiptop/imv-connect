import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldCheck, Check, X } from "lucide-react";

export const Route = createFileRoute("/admin/credito-cobranza/autorizaciones")({
  component: AutorizacionesPage,
});

function AutorizacionesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [estado, setEstado] = useState<string>("solicitada");

  const { data = [] } = useQuery({
    queryKey: ["autorizaciones", estado],
    queryFn: async () => {
      let q = supabase
        .from("credito_autorizaciones" as any)
        .select("id, cliente_id, tipo, estado, monto, dias, motivo, respuesta, solicitado_at, resuelto_at, clientes(razon_social, nombre_comercial)")
        .order("solicitado_at", { ascending: false })
        .limit(300);
      if (estado !== "todas") q = q.eq("estado", estado);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const resolver = useMutation({
    mutationFn: async ({ id, aprobar, respuesta }: { id: string; aprobar: boolean; respuesta: string }) => {
      const { error } = await supabase.from("credito_autorizaciones" as any).update({
        estado: aprobar ? "aprobada" : "rechazada",
        resuelto_por: user?.id ?? null,
        resuelto_at: new Date().toISOString(),
        respuesta,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Autorización resuelta");
      qc.invalidateQueries({ queryKey: ["autorizaciones"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Autorizaciones de crédito</h2>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="solicitada">Solicitadas</SelectItem>
            <SelectItem value="aprobada">Aprobadas</SelectItem>
            <SelectItem value="rechazada">Rechazadas</SelectItem>
            <SelectItem value="todas">Todas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-2 py-2">Fecha</th>
              <th className="text-left px-2 py-2">Cliente</th>
              <th className="text-left px-2 py-2">Tipo</th>
              <th className="text-right px-2 py-2">Monto / Días</th>
              <th className="text-left px-2 py-2">Motivo</th>
              <th className="text-center px-2 py-2">Estado</th>
              <th className="w-40"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Sin solicitudes.</td></tr>
            ) : data.map((a: any) => (
              <tr key={a.id} className="border-t border-border align-top">
                <td className="px-2 py-1.5 text-xs whitespace-nowrap">{new Date(a.solicitado_at).toLocaleDateString("es-MX")}</td>
                <td className="px-2 py-1.5">
                  <Link to="/admin/credito-cobranza/clientes/$id" params={{ id: a.cliente_id }} className="hover:underline">
                    {a.clientes?.nombre_comercial || a.clientes?.razon_social}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-xs capitalize">{String(a.tipo).replace(/_/g, " ")}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs">
                  {a.monto ? `$${Number(a.monto).toLocaleString("es-MX")}` : ""}
                  {a.dias ? ` · ${a.dias}d` : ""}
                </td>
                <td className="px-2 py-1.5 text-xs max-w-md">{a.motivo}</td>
                <td className="px-2 py-1.5 text-center">
                  <Badge variant="outline" className="capitalize">{a.estado}</Badge>
                </td>
                <td className="px-2 py-1.5 text-right">
                  {a.estado === "solicitada" && (
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" className="h-7 gap-1"
                        onClick={() => {
                          const r = prompt("Respuesta / notas:", "");
                          if (r !== null) resolver.mutate({ id: a.id, aprobar: true, respuesta: r });
                        }}>
                        <Check className="h-3 w-3 text-emerald-500" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1"
                        onClick={() => {
                          const r = prompt("Motivo del rechazo:", "");
                          if (r !== null) resolver.mutate({ id: a.id, aprobar: false, respuesta: r });
                        }}>
                        <X className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  )}
                  {a.respuesta && a.estado !== "solicitada" && (
                    <div className="text-xs text-muted-foreground italic">"{a.respuesta}"</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
