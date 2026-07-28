import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Truck } from "lucide-react";

type OC = {
  id: string;
  folio: string;
  estado: string;
  fecha_emision: string | null;
  fecha_esperada: string | null;
  total: number | null;
  almacenes: { nombre: string } | null;
  laboratorios: { nombre: string } | null;
};

const days = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);

/** Alertas de órdenes de compra pendientes de recibir en almacén. */
export default function OcAlertsCard({ almacenId }: { almacenId?: string }) {
  const { data = [] } = useQuery({
    queryKey: ["oc-pendientes-almacen", almacenId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("ordenes_compra")
        .select("id, folio, estado, fecha_emision, fecha_esperada, total, almacenes(nombre), laboratorios(nombre)")
        .in("estado", ["enviada", "parcial"])
        .order("fecha_esperada", { ascending: true, nullsFirst: false })
        .limit(50);
      if (almacenId) q = q.eq("almacen_id", almacenId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as OC[];
    },
    staleTime: 60_000,
  });

  const vencidas = useMemo(
    () => data.filter((o) => o.fecha_esperada && new Date(o.fecha_esperada) < new Date()),
    [data],
  );

  if (!data.length) return null;

  return (
    <Card className="border-amber-500/40">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="h-4 w-4 text-amber-600" />
          Órdenes de compra por recibir
          <Badge variant="secondary">{data.length}</Badge>
          {vencidas.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> {vencidas.length} atrasadas
            </Badge>
          )}
        </CardTitle>
        <Button asChild size="sm" variant="ghost">
          <Link to="/admin/compras/ordenes">Ver todas</Link>
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Folio</th>
              <th className="px-3 py-2 text-left">Proveedor</th>
              <th className="px-3 py-2 text-left">Almacén</th>
              <th className="px-3 py-2 text-left">Emisión</th>
              <th className="px-3 py-2 text-left">Esperada</th>
              <th className="px-3 py-2 text-left">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 10).map((o) => {
              const late = o.fecha_esperada && new Date(o.fecha_esperada) < new Date();
              return (
                <tr key={o.id} className="border-b border-border/40">
                  <td className="px-3 py-2 font-medium">{o.folio}</td>
                  <td className="px-3 py-2">{o.laboratorios?.nombre ?? "—"}</td>
                  <td className="px-3 py-2">{o.almacenes?.nombre ?? "—"}</td>
                  <td className="px-3 py-2">
                    {o.fecha_emision ? `${o.fecha_emision} (${days(o.fecha_emision)} d)` : "—"}
                  </td>
                  <td className={`px-3 py-2 ${late ? "font-medium text-destructive" : ""}`}>
                    {o.fecha_esperada ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={o.estado === "parcial" ? "secondary" : "outline"}>{o.estado}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
