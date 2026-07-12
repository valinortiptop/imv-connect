// @ts-nocheck
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import CalendarView from "@/components/rep/CalendarView";
import { HistoricalSalesPanel } from "@/components/sales/HistoricalSalesPanel";
import { UserSquare2, Mail, Phone, Percent, Users, ShoppingCart, DollarSign, Clock } from "lucide-react";

type Props = {
  repId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
};

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export default function Rep360Drawer({ repId, open, onOpenChange }: Props) {
  const q = useQuery({
    queryKey: ["rep-360", repId],
    enabled: !!repId && open,
    staleTime: 30_000,
    queryFn: async () => {
      if (!repId) return null;
      const [rep, clientes, pedidos, lastAccess] = await Promise.all([
        supabase.from("representantes").select("*").eq("id", repId).maybeSingle(),
        supabase
          .from("clientes")
          .select("id, razon_social, nombre_comercial, telefono, phone, direccion, active")
          .eq("representante_id", repId)
          .order("razon_social")
          .limit(200),
        supabase
          .from("pedidos")
          .select("id, folio, estado, total, subtotal, comision_monto, created_at, cliente_id")
          .eq("representante_id", repId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("rep_access_events" as any)
          .select("signed_in_at, has_location, lat, lng")
          .eq("representante_id", repId)
          .order("signed_in_at", { ascending: false })
          .limit(1),
      ]);

      return {
        rep: rep.data as any,
        clientes: (clientes.data ?? []) as any[],
        pedidos: (pedidos.data ?? []) as any[],
        lastAccess: ((lastAccess.data ?? [])[0] ?? null) as any,
      };
    },
  });

  const rep = q.data?.rep;
  const clientes = q.data?.clientes ?? [];
  const pedidos = q.data?.pedidos ?? [];
  const lastAccess = q.data?.lastAccess;

  const totals = {
    clientes: clientes.length,
    pedidos: pedidos.length,
    ventas: pedidos.reduce((s: number, p: any) => s + Number(p.total ?? p.subtotal ?? 0), 0),
    comision: pedidos.reduce((s: number, p: any) => s + Number(p.comision_monto ?? 0), 0),
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <UserSquare2 className="h-5 w-5" /> {rep?.nombre ?? "Vendedor"}
          </SheetTitle>
          <SheetDescription>Vista 360 del representante</SheetDescription>
        </SheetHeader>

        {q.isLoading && (
          <div className="space-y-3 mt-6">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {rep && (
          <div className="mt-4 space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi icon={<Users className="h-4 w-4" />} label="Clientes" value={String(totals.clientes)} />
              <Kpi icon={<ShoppingCart className="h-4 w-4" />} label="Pedidos" value={String(totals.pedidos)} />
              <Kpi icon={<DollarSign className="h-4 w-4" />} label="Ventas" value={mxn.format(totals.ventas)} />
              <Kpi icon={<Percent className="h-4 w-4" />} label="Comisión" value={mxn.format(totals.comision)} />
            </div>

            <Tabs defaultValue="resumen">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="resumen">Resumen</TabsTrigger>
                <TabsTrigger value="clientes">Clientes</TabsTrigger>
                <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
                <TabsTrigger value="calendario">Calendario</TabsTrigger>
              </TabsList>

              <TabsContent value="resumen" className="space-y-2 pt-4">
                <Row icon={<Mail className="size-3.5" />} label="Email" value={rep.email} />
                <Row icon={<Phone className="size-3.5" />} label="Teléfono" value={rep.telefono} />
                <Row icon={<Percent className="size-3.5" />} label="Comisión default" value={`${Number(rep.comision_default_pct ?? 0).toFixed(1)}%`} />
                <Row label="Estado" value={rep.activo ? "Activo" : "Inactivo"} />
                <Row
                  icon={<Clock className="size-3.5" />}
                  label="Último acceso"
                  value={lastAccess ? fmtDate(lastAccess.signed_in_at) : "—"}
                />
                {rep.notas && (
                  <div className="pt-2">
                    <div className="text-xs uppercase text-muted-foreground mb-1">Notas</div>
                    <p className="text-sm whitespace-pre-wrap">{rep.notas}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="clientes" className="pt-4">
                {clientes.length === 0 ? (
                  <Empty>Sin clientes asignados.</Empty>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {clientes.map((c: any) => (
                      <li key={c.id} className="px-3 py-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="font-medium truncate">
                            {c.nombre_comercial || c.razon_social}
                          </span>
                          {!c.active && <Badge variant="secondary">Inactivo</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {c.telefono || c.phone || c.direccion || "—"}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="pedidos" className="pt-4">
                {pedidos.length === 0 ? (
                  <Empty>Sin pedidos.</Empty>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {pedidos.slice(0, 20).map((p: any) => (
                      <li key={p.id} className="px-3 py-2 text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium">{p.folio ?? p.id.slice(0, 8)}</span>
                          <span className="tabular-nums font-medium">{mxn.format(p.total ?? 0)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground flex justify-between mt-0.5">
                          <span className="capitalize">{p.estado ?? "—"}</span>
                          <span>{fmtDate(p.created_at)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="calendario" className="pt-4">
                <CalendarView repId={repId!} embedded />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          {icon} {label}
        </div>
        <div className="text-lg font-bold tabular-nums mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function Row({ icon, label, value }: { icon?: React.ReactNode; label: string; value: any }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/40">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground shrink-0">
        {icon}
        {label}
      </div>
      <div className="text-sm text-right truncate">{value ?? "—"}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
