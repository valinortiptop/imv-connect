import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllSavedRoutesFn } from "@/lib/rep-supervisor.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import RouteDetailsDialog from "@/components/rep/RouteDetailsDialog";
import { Loader2, MapPin } from "lucide-react";

const fdate = (s?: string | null) =>
  s ? new Date(`${String(s).slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

export default function SupervisorRoutesHistory() {
  const [scope, setScope] = useState<"all" | "past" | "future">("past");
  const [repId, setRepId] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const listRoutes = useServerFn(listAllSavedRoutesFn);
  const { data, isLoading, error } = useQuery({
    queryKey: ["supervisor-routes", scope, from, to],
    queryFn: () =>
      listRoutes({
        data: {
          scope,
          from: from || undefined,
          to: to || undefined,
          limit: 300,
        },
      }),
  });

  const reps = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data?.routes ?? []) {
      if (r.representante_id) m.set(String(r.representante_id), r.rep_nombre ?? "Sin nombre");
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.routes ?? []).filter((r: any) => {
      if (repId !== "all" && String(r.representante_id) !== repId) return false;
      if (!needle) return true;
      const hay = [
        r.nombre,
        r.rep_nombre,
        r.fecha,
        ...(r.ordered_stops ?? []).map((s: any) => s?.nombre),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [data, repId, q]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Rutas históricas y programadas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-[11px]">Periodo</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="past">Pasadas</SelectItem>
                <SelectItem value="future">Programadas</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Representante</Label>
            <Select value={repId} onValueChange={setRepId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {reps.map(([id, nombre]) => (
                  <SelectItem key={id} value={id}>{nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Buscar</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ruta, rep o cliente…" />
          </div>
        </div>

        {(from || to || repId !== "all" || q) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setFrom(""); setTo(""); setRepId("all"); setQ(""); }}
          >
            Limpiar filtros
          </Button>
        )}

        {error && <p className="text-sm text-destructive">Error: {(error as Error).message}</p>}
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando rutas…
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Sin rutas con estos filtros
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">{rows.length} rutas</p>
            {rows.map((r: any) => (
              <div key={r.id} className="rounded-lg border">
                <button
                  type="button"
                  onClick={() => setOpenId(r.id)}
                  className="flex w-full items-center gap-2 p-3 text-left hover:bg-accent/50"
                >
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {r.nombre || `Ruta ${String(r.fecha).slice(0, 10)}`}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {fdate(r.fecha)} · {r.rep_nombre ?? "Sin representante"} ·{" "}
                      {(r.ordered_stops ?? []).length} paradas · {Number(r.total_km ?? 0).toFixed(1)} km
                    </p>
                  </div>
                  <Badge
                    variant={String(r.fecha) >= (data?.today ?? "") ? "default" : "outline"}
                    className="shrink-0 text-[10px]"
                  >
                    {String(r.fecha) >= (data?.today ?? "") ? "Programada" : "Pasada"}
                  </Badge>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Detalle completo con estado de visita por cliente (verde = visitado) */}
        <RouteDetailsDialog
          routeId={openId}
          open={!!openId}
          onOpenChange={(v) => !v && setOpenId(null)}
        />
      </CardContent>
    </Card>
  );
}
