// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listPurchaseAlerts,
  assignAlerta,
  resolverAlertaCompras,
  regenerarAlertasCompras,
} from "@/lib/compras.functions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, RefreshCw, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/admin/compras/alertas")({
  head: () => ({ meta: [{ title: "Alertas de compras" }] }),
  component: AlertasPage,
});

const TIPOS: Record<string, { label: string; color: string }> = {
  stock_critico: { label: "Stock crítico", color: "bg-rose-500/15 text-rose-600" },
  reorden: { label: "Reorden", color: "bg-amber-500/15 text-amber-600" },
  caducidad: { label: "Caducidad", color: "bg-orange-500/15 text-orange-600" },
  sobrestock: { label: "Sobrestock", color: "bg-slate-500/15 text-slate-600" },
  incremento_costo: { label: "Incremento de costo", color: "bg-violet-500/15 text-violet-600" },
  prov_incumple: { label: "Proveedor bajo cumplimiento", color: "bg-fuchsia-500/15 text-fuchsia-600" },
  oc_vencida: { label: "OC vencida", color: "bg-red-500/15 text-red-600" },
  promo_sin_stock: { label: "Promo sin stock", color: "bg-yellow-500/15 text-yellow-600" },
};

const SEVERIDAD_ORDER: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
const PRIORIDAD_ORDER: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 };

function AlertasPage() {
  const qc = useQueryClient();
  const fnList = useServerFn(listPurchaseAlerts);
  const fnAssign = useServerFn(assignAlerta);
  const fnResolve = useServerFn(resolverAlertaCompras);
  const fnRegen = useServerFn(regenerarAlertasCompras);

  const [filtroTipo, setFiltroTipo] = useState<string>("all");
  const [filtroPrio, setFiltroPrio] = useState<string>("all");
  const [mine, setMine] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["purchase-alerts", { mine, filtroTipo }],
    queryFn: () => fnList({ data: { onlyOpen: true, mine, tipos: filtroTipo === "all" ? undefined : [filtroTipo] } }),
  });

  const usersQ = useQuery({
    queryKey: ["admin-users-lookup"],
    queryFn: async () => {
      const { data } = await supabase.rpc("list_admin_users" as any);
      return (data ?? []) as any[];
    },
  });
  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of usersQ.data ?? []) m.set(u.id, u.email ?? u.full_name ?? u.id);
    return m;
  }, [usersQ.data]);

  const alertas = useMemo(() => {
    let rows = data?.alertas ?? [];
    if (filtroPrio !== "all") rows = rows.filter((a: any) => (a.prioridad ?? a.severidad) === filtroPrio);
    return [...rows].sort((a: any, b: any) => {
      const pA = PRIORIDAD_ORDER[a.prioridad ?? a.severidad ?? "media"] ?? 4;
      const pB = PRIORIDAD_ORDER[b.prioridad ?? b.severidad ?? "media"] ?? 4;
      if (pA !== pB) return pA - pB;
      return (SEVERIDAD_ORDER[a.severidad] ?? 4) - (SEVERIDAD_ORDER[b.severidad] ?? 4);
    });
  }, [data, filtroPrio]);

  const mResolve = useMutation({
    mutationFn: (id: string) => fnResolve({ data: { id } }),
    onSuccess: () => { toast.success("Alerta resuelta"); qc.invalidateQueries({ queryKey: ["purchase-alerts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const mAssign = useMutation({
    mutationFn: (p: any) => fnAssign({ data: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-alerts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const mRegen = useMutation({
    mutationFn: () => fnRegen(),
    onSuccess: (r: any) => { toast.success(`${r.generadas} alertas regeneradas`); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Bell className="h-6 w-6 text-primary" /> Centro de alertas
          </h1>
          <p className="text-sm text-muted-foreground">Alertas inteligentes de compras — asigna responsables y prioridades.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => mRegen.mutate()} disabled={mRegen.isPending}>
          <RefreshCw className={`mr-1 h-4 w-4 ${mRegen.isPending ? "animate-spin" : ""}`} /> Regenerar
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Todos los tipos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {Object.entries(TIPOS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroPrio} onValueChange={setFiltroPrio}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Toda prioridad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda prioridad</SelectItem>
            <SelectItem value="critica">Crítica</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Media</SelectItem>
            <SelectItem value="baja">Baja</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          Sólo asignadas a mí
        </label>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Alerta</th>
              <th className="px-3 py-2">Prioridad</th>
              <th className="px-3 py-2">Responsable</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Cargando…</td></tr>
            ) : alertas.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Sin alertas abiertas.</td></tr>
            ) : alertas.map((a: any) => {
              const t = TIPOS[a.tipo] ?? { label: a.tipo, color: "bg-muted text-muted-foreground" };
              const prio = a.prioridad ?? a.severidad ?? "media";
              return (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${t.color}`}>{t.label}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{a.titulo}</div>
                    <div className="text-xs text-muted-foreground">{a.detalle}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={prio}
                      onValueChange={(v) => mAssign.mutate({ id: a.id, responsable_user_id: a.responsable_user_id, prioridad: v })}
                    >
                      <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="critica">Crítica</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="media">Media</SelectItem>
                        <SelectItem value="baja">Baja</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={a.responsable_user_id ?? "none"}
                      onValueChange={(v) => mAssign.mutate({ id: a.id, responsable_user_id: v === "none" ? null : v, prioridad: a.prioridad })}
                    >
                      <SelectTrigger className="h-7 w-48 text-xs"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {(usersQ.data ?? []).map((u: any) => (
                          <SelectItem key={u.id} value={u.id}>{u.email ?? u.full_name ?? u.id.slice(0, 8)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => mResolve.mutate(a.id)}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Resolver
                    </Button>
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
