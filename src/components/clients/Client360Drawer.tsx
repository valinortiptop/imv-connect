import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  ShoppingCart,
  Tag,
  ClipboardList,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  ExternalLink,
  Pencil,
  UserRound,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ClientCalendarPanel from "@/components/clients/ClientCalendarPanel";

type Props = {
  clientId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEdit?: (clientId: string) => void;
  canEdit?: boolean;
};


const fmt = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        maximumFractionDigits: 2,
      }).format(Number(n));

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

export function Client360Drawer({ clientId, open, onOpenChange, onEdit, canEdit }: Props) {
  const q = useQuery({
    queryKey: ["client-360", clientId],
    enabled: !!clientId && open,
    staleTime: 30_000,
    queryFn: async () => {
      if (!clientId) return null;
      const [cli, orders, overrides, payments, repr] = await Promise.all([
        supabase
          .from("clientes")
          .select(
            "id, razon_social, nombre_comercial, company, nickname, rfc, curp, email, email_extra, telefono, phone, contact, direccion, codigo_postal, central, client_type, payment_method, payment_terms, credit_limit, delivery_window_from, delivery_window_until, delivery_notes, active, portal_activo, token_portal, notas, created_at, representante_id, price_list_id, lat, lng, google_place_id, price_lists(name)",
          )
          .eq("id", clientId)
          .maybeSingle(),
        supabase
          .from("pedidos")
          .select("id, folio, estado, total, created_at")
          .eq("cliente_id", clientId)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("client_price_overrides")
          .select("price_with_iva, notes, product_id")
          .eq("client_id", clientId)
          .limit(20),
        supabase
          .from("facturas")
          .select("id, folio, total, pagado, estado, fecha_emision")
          .eq("cliente_id", clientId)
          .order("fecha_emision", { ascending: false })
          .limit(10),
        Promise.resolve({ data: null }),
      ]);

      let representante: any = null;
      const rid = (cli.data as any)?.representante_id;
      if (rid) {
        const r = await supabase
          .from("representantes")
          .select("nombre, telefono, email")
          .eq("id", rid)
          .maybeSingle();
        representante = r.data;
      }

      return {
        client: cli.data as any,
        orders: (orders.data ?? []) as any[],
        overrides: (overrides.data ?? []) as any[],
        facturas: (payments.data ?? []) as any[],
        representante,
      };
    },
  });

  const c = q.data?.client;
  const orders = q.data?.orders ?? [];
  const totalOrders = orders.reduce((n, o: any) => n + Number(o.total ?? 0), 0);
  const last = orders[0];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        {q.isLoading && (
          <div className="space-y-4 pt-6">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {!q.isLoading && c && (
          <>
            <SheetHeader className="text-left">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Building2 className="size-3.5" />
                <span>{c.client_type === "mayoreo" ? "Mayoreo" : c.client_type === "menudeo" ? "Menudeo" : "Cliente"}</span>
                {c.rfc && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{c.rfc}</span>
                  </>
                )}
              </div>
              <SheetTitle className="text-2xl">
                {c.nombre_comercial?.trim() || c.razon_social || c.nickname || "Cliente"}
              </SheetTitle>
              <SheetDescription>
                {c.razon_social && c.nombre_comercial?.trim() ? c.razon_social : c.company || "—"}
              </SheetDescription>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {c.client_type && <Badge variant="secondary" className="capitalize">{c.client_type}</Badge>}
                {c.payment_method && <Badge variant="outline">{c.payment_method}</Badge>}
                {c.payment_terms != null && <Badge variant="outline">{Number(c.payment_terms)} días</Badge>}
                {!c.active && <Badge variant="destructive">Inactivo</Badge>}
                {c.portal_activo && <Badge>Portal activo</Badge>}
              </div>
            </SheetHeader>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Kpi label="Pedidos (10)" value={String(orders.length)} />
              <Kpi label="Importe (10)" value={fmt(totalOrders)} accent />
              <Kpi label="Último pedido" value={fmtDate(last?.created_at)} />
              <Kpi label="Crédito" value={c.credit_limit != null ? fmt(c.credit_limit) : "—"} />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link to="/admin/clientes/$id" params={{ id: c.id }}>
                  <ExternalLink className="size-3.5" /> Ver ficha completa
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost" className="gap-1.5">
                <Link to="/admin/clientes/$id/precios" params={{ id: c.id }}>
                  <Tag className="size-3.5" /> Precios
                </Link>
              </Button>
              {canEdit && onEdit && (
                <Button
                  size="sm"
                  variant="default"
                  className="gap-1.5"
                  onClick={() => {
                    onEdit(c.id);
                    onOpenChange(false);
                  }}
                >
                  <Pencil className="size-3.5" /> Editar
                </Button>
              )}
            </div>


            <Tabs defaultValue="general" className="mt-6">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
                <TabsTrigger value="historial">Historial</TabsTrigger>
                <TabsTrigger value="precios">Precios</TabsTrigger>
                <TabsTrigger value="pagos">Facturas</TabsTrigger>
                <TabsTrigger value="calendario">Calendario</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-3 pt-4">
                <Row icon={<Phone className="size-3.5" />} label="Teléfono" value={c.telefono || c.phone} />
                <Row icon={<Mail className="size-3.5" />} label="Email" value={c.email || c.email_extra} />
                <Row label="Contacto" value={c.contact} />
                
                <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/40">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground shrink-0">
                    <MapPin className="size-3.5" /> Dirección
                  </div>
                  <div className="text-sm text-right">
                    {c.direccion ? (
                      <a
                        href={
                          c.lat && c.lng
                            ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`
                            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.direccion)}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline inline-flex items-start gap-1"
                        title="Abrir en Google Maps"
                      >
                        <span>{c.direccion}</span>
                        <ExternalLink className="size-3 mt-0.5 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
                {(c.lat && c.lng) && (
                  <div className="rounded-md overflow-hidden border border-border">
                    <iframe
                      title="Ubicación del cliente"
                      width="100%"
                      height="180"
                      style={{ border: 0, display: "block" }}
                      loading="lazy"
                      src={`https://www.google.com/maps?q=${c.lat},${c.lng}&z=15&output=embed`}
                    />
                  </div>
                )}
                <Row label="Código postal" value={c.codigo_postal} />
                <Row label="Central" value={c.central} />

                <Row label="RFC" value={c.rfc} />
                <Row label="CURP" value={c.curp} />
                <Row label="CFDI" value={(c as any).nombre_cfdi} />
                <Row
                  icon={<CreditCard className="size-3.5" />}
                  label="Método de pago"
                  value={c.payment_method}
                />
                <Row label="Términos" value={c.payment_terms != null ? `${c.payment_terms} días` : null} />
                <Row label="Lista de precios" value={(c as any).price_lists?.name} />
                <Row
                  label="Ventana de entrega"
                  value={
                    c.delivery_window_from || c.delivery_window_until
                      ? `${c.delivery_window_from ?? "—"} – ${c.delivery_window_until ?? "—"}`
                      : null
                  }
                />
                <Row label="Notas de entrega" value={c.delivery_notes} />
                <RepresentanteCard rep={q.data?.representante} />
                <Row label="Alta" value={fmtDate(c.created_at)} />
                {c.notas && (
                  <div className="pt-2">
                    <div className="text-xs uppercase text-muted-foreground mb-1">Notas</div>
                    <p className="text-sm whitespace-pre-wrap">{c.notas}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="pedidos" className="pt-4">
                {orders.length === 0 ? (
                  <Empty>Sin pedidos recientes.</Empty>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {orders.map((o: any) => (
                      <li key={o.id} className="px-3 py-2 text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium">{o.folio ?? o.id.slice(0, 8)}</span>
                          <span className="tabular-nums font-medium">{fmt(o.total)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground flex justify-between mt-0.5">
                          <span className="capitalize">{o.estado ?? "—"}</span>
                          <span>{fmtDate(o.created_at)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="historial" className="pt-4">
                <HistoricalSalesPanel clientId={clientId!} title="Ventas históricas del cliente" compact />
              </TabsContent>



              <TabsContent value="precios" className="pt-4">
                <Section
                  icon={<ClipboardList className="size-4" />}
                  title={`Precios personalizados (${q.data!.overrides.length})`}
                >
                  {q.data!.overrides.length === 0 ? (
                    <Empty>Sin precios personalizados.</Empty>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {q.data!.overrides.map((o: any, i: number) => (
                        <li key={i} className="flex justify-between px-3 py-2 text-sm">
                          <span className="truncate text-muted-foreground">
                            {o.notes || o.product_id?.slice(0, 8) || "—"}
                          </span>
                          <span className="font-medium tabular-nums">{fmt(o.price_with_iva)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </TabsContent>

              <TabsContent value="pagos" className="pt-4">
                {q.data!.facturas.length === 0 ? (
                  <Empty>Sin facturas registradas.</Empty>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {q.data!.facturas.map((f: any) => (
                      <li key={f.id} className="px-3 py-2 text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium">{f.folio ?? f.id.slice(0, 8)}</span>
                          <span className="tabular-nums font-medium">{fmt(f.total)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground flex justify-between mt-0.5">
                          <span className="capitalize">{f.estado ?? "—"} · saldo {fmt(Number(f.total ?? 0) - Number(f.pagado ?? 0))}</span>
                          <span>{fmtDate(f.fecha_emision)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="calendario" className="pt-4">
                <ClientCalendarPanel clienteId={clientId!} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-lg border bg-card px-3 py-2", accent && "border-primary/40 bg-primary/5")}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-base font-semibold tabular-nums", accent && "text-primary")}>{value}</div>
    </div>
  );
}

function Row({ icon, label, value }: { icon?: React.ReactNode; label: string; value: any }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-4 text-sm border-b last:border-0 py-1.5">
      <span className="text-muted-foreground flex items-center gap-1.5">{icon}{label}</span>
      <span className="text-right font-medium">{String(value)}</span>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">{icon} {title}</h3>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground italic px-1">{children}</p>;
}

function RepresentanteCard({
  rep,
}: {
  rep: { nombre?: string | null; telefono?: string | null; email?: string | null } | null | undefined;
}) {
  if (!rep || !rep.nombre) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
        <UserRound className="size-3.5" /> Sin representante asignado
      </div>
    );
  }
  const phoneDigits = (rep.telefono || "").replace(/\D+/g, "");
  const waNumber =
    phoneDigits.length === 10 ? `52${phoneDigits}` : phoneDigits; // default MX country code
  return (
    <div className="rounded-md border bg-card px-3 py-2.5">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <UserRound className="size-3.5" /> Representante de ventas
      </div>
      <div className="mt-0.5 text-sm font-semibold">{rep.nombre}</div>
      {(rep.telefono || rep.email) && (
        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {rep.telefono && (
            <div className="flex items-center gap-1.5">
              <Phone className="size-3" /> {rep.telefono}
            </div>
          )}
          {rep.email && (
            <div className="flex items-center gap-1.5">
              <Mail className="size-3" /> {rep.email}
            </div>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {phoneDigits.length >= 10 && (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 bg-emerald-500/10 border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/20"
          >
            <a
              href={`https://wa.me/${waNumber}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="size-3.5" /> WhatsApp
            </a>
          </Button>
        )}
        {rep.telefono && (
          <Button asChild size="sm" variant="outline" className="h-7 gap-1.5">
            <a href={`tel:${rep.telefono}`}>
              <Phone className="size-3.5" /> Llamar
            </a>
          </Button>
        )}
        {rep.email && (
          <Button asChild size="sm" variant="outline" className="h-7 gap-1.5">
            <a href={`mailto:${rep.email}`}>
              <Mail className="size-3.5" /> Email
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

