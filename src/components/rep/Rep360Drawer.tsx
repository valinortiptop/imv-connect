import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRep360Fn } from "@/lib/rep-supervisor.functions";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import SavedRoutePreview from "@/components/rep/SavedRoutePreview";
import { Loader2, MapPin } from "lucide-react";

const money = (n: number) => "$" + Math.round(Number(n ?? 0)).toLocaleString("es-MX");
const fdate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fdatetime = (s?: string | null) =>
  s ? new Date(s).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>
  );
}

export default function Rep360Drawer({
  repId,
  onOpenChange,
}: {
  repId: string | null;
  onOpenChange: (v: boolean) => void;
}) {
  const [days, setDays] = useState(90);
  const [openRoute, setOpenRoute] = useState<string | null>(null);
  const fetch360 = useServerFn(getRep360Fn);

  const { data, isLoading, error } = useQuery({
    queryKey: ["rep-360", repId, days],
    queryFn: () => fetch360({ data: { repId: repId!, days } }),
    enabled: !!repId,
  });

  const k = data?.kpis;
  const today = data?.today ?? new Date().toISOString().slice(0, 10);
  const futuras = (data?.routes ?? []).filter((r: any) => String(r.fecha) >= today);
  const pasadas = (data?.routes ?? []).filter((r: any) => String(r.fecha) < today);

  const RouteRow = ({ r }: { r: any }) => (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpenRoute(openRoute === r.id ? null : r.id)}
        className="flex w-full items-center gap-2 p-2.5 text-left hover:bg-accent/50"
      >
        <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{r.nombre || `Ruta ${fdate(r.fecha)}`}</p>
          <p className="text-[11px] text-muted-foreground">
            {fdate(r.fecha)} · {(r.ordered_stops ?? []).length} paradas ·{" "}
            {Number(r.total_km ?? 0).toFixed(1)} km · {Math.round(Number(r.total_minutes ?? 0))} min
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {openRoute === r.id ? "Ocultar" : "Ver"}
        </Badge>
      </button>
      {openRoute === r.id && (
        <div className="space-y-2 border-t p-2.5">
          <SavedRoutePreview
            polyline={r.polyline}
            stops={r.ordered_stops ?? []}
            startLat={r.start_lat}
            startLng={r.start_lng}
            height={200}
          />
          <ol className="space-y-1">
            {(r.ordered_stops ?? []).map((s: any, i: number) => (
              <li key={`${r.id}-${i}`} className="flex gap-2 text-xs">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <b className="block truncate">{s.nombre || "Cliente"}</b>
                  {s.direccion && <span className="text-muted-foreground">{s.direccion}</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );

  return (
    <Sheet open={!!repId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="text-base">{data?.rep?.nombre ?? "Representante"}</SheetTitle>
          <SheetDescription className="text-xs">
            {data?.rep?.email || "Sin correo"}
            {data?.rep?.telefono ? ` · ${data.rep.telefono}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 flex flex-wrap gap-1">
          {[7, 30, 90, 365].map((d) => (
            <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
              {d === 365 ? "1a" : `${d}d`}
            </Button>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-destructive">Error: {(error as Error).message}</p>}
        {isLoading ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando 360…
          </p>
        ) : (
          <Tabs defaultValue="resumen" className="mt-3">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="resumen">Resumen</TabsTrigger>
              <TabsTrigger value="clientes">Clientes ({k?.clientes ?? 0})</TabsTrigger>
              <TabsTrigger value="prospectos">Prospectos ({k?.prospectos ?? 0})</TabsTrigger>
              <TabsTrigger value="rutas">Rutas ({k?.rutas ?? 0})</TabsTrigger>
              <TabsTrigger value="actividad">Actividad</TabsTrigger>
            </TabsList>

            <TabsContent value="resumen" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Ventas" value={money(k?.ventas ?? 0)} />
              <Stat label="Pedidos" value={k?.pedidos ?? 0} />
              <Stat label="Visitas" value={k?.visitas ?? 0} />
              <Stat label="Ticket prom." value={money(k?.ticket_prom ?? 0)} />
              <Stat label="Ratio V→P" value={`${Math.round((k?.ratio ?? 0) * 100)}%`} />
              <Stat label="Duración prom." value={`${k?.duracion_prom_min ?? 0}m`} />
              <Stat label="Clientes" value={k?.clientes ?? 0} />
              <Stat label="Prospectos" value={k?.prospectos ?? 0} />
              <Stat label="Rutas futuras" value={k?.rutas_futuras ?? 0} />
            </TabsContent>

            <TabsContent value="clientes" className="mt-3 space-y-2">
              {(data?.clients ?? []).length === 0 && <Empty>Sin clientes asignados</Empty>}
              {(data?.clients ?? []).map((c: any) => (
                <Card key={c.id}>
                  <CardContent className="p-2.5">
                    <p className="truncate text-sm font-medium">
                      {c.nombre_comercial || c.razon_social || c.nickname || "Cliente"}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[c.direccion, c.municipio, c.telefono].filter(Boolean).join(" · ") || "Sin datos"}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="prospectos" className="mt-3 space-y-2">
              {(data?.prospects ?? []).length === 0 && <Empty>Sin prospectos asignados</Empty>}
              {(data?.prospects ?? []).map((p: any) => (
                <Card key={p.id}>
                  <CardContent className="flex items-center gap-2 p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {[p.direccion, p.municipio, p.phone].filter(Boolean).join(" · ") || "Sin datos"}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">{p.status ?? "nuevo"}</Badge>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="rutas" className="mt-3 space-y-3">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                  Próximas ({futuras.length})
                </h3>
                {futuras.length === 0 && <Empty>Sin rutas programadas</Empty>}
                {futuras.map((r: any) => <RouteRow key={r.id} r={r} />)}
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                  Pasadas ({pasadas.length})
                </h3>
                {pasadas.length === 0 && <Empty>Sin rutas pasadas</Empty>}
                {pasadas.map((r: any) => <RouteRow key={r.id} r={r} />)}
              </div>
            </TabsContent>

            <TabsContent value="actividad" className="mt-3 space-y-3">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Visitas recientes</h3>
                {(data?.visits ?? []).length === 0 && <Empty>Sin visitas en el período</Empty>}
                {(data?.visits ?? []).slice(0, 60).map((v: any) => (
                  <div key={v.id} className="rounded-lg border p-2.5">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">
                        {v.cliente_nombre ?? (v.prospect_id ? "Prospecto" : "Visita")}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {fdatetime(v.check_in_at)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {v.outcome ?? "sin resultado"}
                      {v.duracion_min != null ? ` · ${v.duracion_min} min` : " · en curso"}
                      {v.notes ? ` · ${v.notes}` : ""}
                    </p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Pedidos recientes</h3>
                {(data?.pedidos ?? []).length === 0 && <Empty>Sin pedidos en el período</Empty>}
                {(data?.pedidos ?? []).slice(0, 60).map((p: any) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg border p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.folio ?? p.id.slice(0, 8)}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {p.cliente_nombre ?? "—"} · {fdate(p.created_at)} · {p.estado ?? ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{money(p.total)}</span>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
