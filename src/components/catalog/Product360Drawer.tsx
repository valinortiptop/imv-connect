import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package,
  Layers,
  Boxes,
  Truck,
  Tag,
  ClipboardList,
  BadgePercent,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  productId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
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

export function Product360Drawer({ productId, open, onOpenChange }: Props) {
  const q = useQuery({
    queryKey: ["product-360", productId],
    enabled: !!productId && open,
    staleTime: 30_000,
    queryFn: async () => {
      if (!productId) return null;
      const [prod, stock, movs, items, overrides, promos, listItems] = await Promise.all([
        supabase
          .from("productos")
          .select(
            "id, sku, nombre, descripcion, presentacion, especie, categoria, imagen_url, precio_lista, unidad, iva_pct, ieps_pct, tax_regime, marca, proveedor, peso_kg, costo_civa, costo_siva, bonificacion_pct, linea, grupo, tipo_producto, sat_clave, stock_comprometido, stock_en_camino, activo, laboratorios(nombre, logo_url)",
          )
          .eq("id", productId)
          .maybeSingle(),
        supabase
          .from("stock")
          .select("cantidad, almacenes(nombre)")
          .eq("producto_id", productId),
        supabase
          .from("movimientos_inventario")
          .select("id, tipo, cantidad, referencia, notas, created_at, almacenes(nombre)")
          .eq("producto_id", productId)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("pedido_items")
          .select(
            "id, cantidad, precio_unitario, pedidos(id, folio, estado, created_at, clientes(razon_social, nombre_comercial))",
          )
          .eq("producto_id", productId)
          .order("id", { ascending: false })
          .limit(10),
        supabase
          .from("client_price_overrides")
          .select("price_with_iva, notes, clientes(id, razon_social, nombre_comercial)")
          .eq("product_id", productId)
          .limit(50),
        supabase
          .from("product_promotions")
          .select("id, name, discount_pct, valid_from, valid_to, active")
          .eq("product_id", productId)
          .eq("active", true),
        supabase
          .from("price_list_items")
          .select("price_with_iva, manual_override, price_lists(name)")
          .eq("product_id", productId),
      ]);
      return {
        product: prod.data as any,
        stock: (stock.data ?? []) as any[],
        movs: (movs.data ?? []) as any[],
        orderItems: (items.data ?? []) as any[],
        overrides: (overrides.data ?? []) as any[],
        promos: (promos.data ?? []) as any[],
        listItems: (listItems.data ?? []) as any[],
      };
    },
  });

  const p = q.data?.product;
  const totalStock = (q.data?.stock ?? []).reduce((n, s: any) => n + Number(s.cantidad ?? 0), 0);
  const disponible = Math.max(totalStock - Number(p?.stock_comprometido ?? 0), 0);

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

        {!q.isLoading && p && (
          <>
            <SheetHeader className="text-left">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Layers className="size-3.5" />
                <span>{p.laboratorios?.nombre ?? p.marca ?? "—"}</span>
                <span>·</span>
                <span className="font-mono">{p.sku ?? "—"}</span>
              </div>
              <SheetTitle className="text-2xl">{p.nombre}</SheetTitle>
              <SheetDescription>
                {[p.linea, p.grupo, p.tipo_producto].filter(Boolean).join(" · ") || "Sin clasificación"}
              </SheetDescription>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {p.linea && <Badge variant="outline">{p.linea}</Badge>}
                {p.grupo && <Badge variant="secondary">{p.grupo}</Badge>}
                {p.tipo_producto && <Badge>{p.tipo_producto}</Badge>}
                <Badge variant="outline">IVA {Number(p.iva_pct ?? 0)}%</Badge>
                {Number(p.ieps_pct ?? 0) > 0 && (
                  <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
                    IEPS {Number(p.ieps_pct)}%
                  </Badge>
                )}
                {p.tax_regime && (
                  <Badge variant="secondary" className="font-normal">
                    {p.tax_regime}
                  </Badge>
                )}
                {!p.activo && <Badge variant="destructive">Inactivo</Badge>}
              </div>
            </SheetHeader>

            <div className="mt-5 flex items-start gap-4">
              {p.imagen_url ? (
                <img
                  src={p.imagen_url}
                  alt={p.nombre}
                  className="h-28 w-28 object-contain rounded-lg border bg-muted/30"
                />
              ) : (
                <div className="h-28 w-28 flex items-center justify-center rounded-lg border bg-muted/30">
                  <Package className="h-10 w-10 text-muted-foreground/40" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 flex-1">
                <Kpi label="Precio c/IVA" value={fmt(p.precio_lista)} accent />
                <Kpi label="Disponible" value={disponible.toLocaleString()} />
                <Kpi label="En camino" value={Number(p.stock_en_camino ?? 0).toLocaleString()} />
                <Kpi label="Comprometido" value={Number(p.stock_comprometido ?? 0).toLocaleString()} />
              </div>
            </div>

            <Tabs defaultValue="general" className="mt-6">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="precios">Precios</TabsTrigger>
                <TabsTrigger value="stock">Stock</TabsTrigger>
                <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
                <TabsTrigger value="promos">Promos</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-3 pt-4">
                <Row label="SKU" value={p.sku} />
                <Row label="Clase" value={p.laboratorios?.nombre ?? p.marca} />
                <Row label="Proveedor" value={p.proveedor} />
                <Row label="Línea" value={p.linea} />
                <Row label="Grupo" value={p.grupo} />
                <Row label="Tipo de producto" value={p.tipo_producto} />
                <Row label="Categoría" value={p.categoria} />
                <Row label="Presentación" value={p.presentacion} />
                <Row label="Especie" value={Array.isArray(p.especie) ? p.especie.join(", ") : p.especie} />
                <Row label="Unidad" value={p.unidad} />
                <Row label="Peso" value={p.peso_kg ? `${p.peso_kg} kg` : null} />
                <Row label="Costo c/IVA" value={fmt(p.costo_civa)} />
                <Row label="Costo s/IVA" value={fmt(p.costo_siva)} />
                <Row label="Bonificación" value={p.bonificacion_pct ? `${p.bonificacion_pct} %` : null} />
                <Row label="Clave SAT" value={p.sat_clave} />
                {p.descripcion && (
                  <div className="pt-2">
                    <div className="text-xs uppercase text-muted-foreground mb-1">Descripción</div>
                    <p className="text-sm whitespace-pre-wrap">{p.descripcion}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="precios" className="space-y-4 pt-4">
                <Section icon={<Tag className="size-4" />} title="Impuestos aplicables">
                  <TaxBreakdown
                    precioConImpuestos={Number(p.precio_lista ?? 0)}
                    ivaPct={Number(p.iva_pct ?? 0)}
                    iepsPct={Number(p.ieps_pct ?? 0)}
                    regimen={p.tax_regime ?? null}
                  />
                </Section>
                <Section icon={<Tag className="size-4" />} title="Listas de precios">
                  {q.data!.listItems.length === 0 ? (
                    <Empty>Solo precio Mayoreo ({fmt(p.precio_lista)}).</Empty>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {q.data!.listItems.map((li: any, i: number) => (
                        <li key={i} className="flex justify-between px-3 py-2 text-sm">
                          <span>
                            {li.price_lists?.name ?? "—"}{" "}
                            {li.manual_override && (
                              <Badge variant="outline" className="ml-1 text-[10px]">manual</Badge>
                            )}
                          </span>
                          <span className="font-medium">{fmt(li.price_with_iva)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
                <Section icon={<ClipboardList className="size-4" />} title={`Precios personalizados (${q.data!.overrides.length})`}>
                  {q.data!.overrides.length === 0 ? (
                    <Empty>Ningún cliente tiene precio personalizado.</Empty>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {q.data!.overrides.map((o: any, i: number) => (
                        <li key={i} className="flex justify-between px-3 py-2 text-sm">
                          <span className="truncate">
                            {o.clientes?.nombre_comercial?.trim() || o.clientes?.razon_social || "—"}
                          </span>
                          <span className="font-medium">{fmt(o.price_with_iva)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </TabsContent>

              <TabsContent value="stock" className="space-y-4 pt-4">
                <Section icon={<Boxes className="size-4" />} title="Por almacén">
                  {q.data!.stock.length === 0 ? (
                    <Empty>Sin stock registrado.</Empty>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {q.data!.stock.map((s: any, i: number) => (
                        <li key={i} className="flex justify-between px-3 py-2 text-sm">
                          <span>{s.almacenes?.nombre ?? "—"}</span>
                          <span className="font-medium tabular-nums">{Number(s.cantidad ?? 0).toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
                <Section icon={<Truck className="size-4" />} title="Últimos movimientos">
                  {q.data!.movs.length === 0 ? (
                    <Empty>Sin movimientos.</Empty>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {q.data!.movs.map((m: any) => (
                        <li key={m.id} className="px-3 py-2 text-sm">
                          <div className="flex justify-between">
                            <span className="capitalize">{m.tipo}</span>
                            <span className="tabular-nums font-medium">
                              {Number(m.cantidad ?? 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground flex justify-between mt-0.5">
                            <span>{m.almacenes?.nombre ?? "—"} · {m.referencia ?? m.notas ?? ""}</span>
                            <span>{fmtDate(m.created_at)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </TabsContent>

              <TabsContent value="pedidos" className="pt-4">
                {q.data!.orderItems.length === 0 ? (
                  <Empty>Este producto no aparece en pedidos recientes.</Empty>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {q.data!.orderItems.map((it: any) => (
                      <li key={it.id} className="px-3 py-2 text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium">
                            {it.pedidos?.clientes?.nombre_comercial?.trim() ||
                              it.pedidos?.clientes?.razon_social ||
                              "—"}
                          </span>
                          <span className="tabular-nums">{Number(it.cantidad)} × {fmt(it.precio_unitario)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground flex justify-between mt-0.5">
                          <span>{it.pedidos?.folio ?? "—"} · {it.pedidos?.estado ?? "—"}</span>
                          <span>{fmtDate(it.pedidos?.created_at)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="promos" className="pt-4">
                {q.data!.promos.length === 0 ? (
                  <Empty>Sin promociones activas.</Empty>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {q.data!.promos.map((pr: any) => (
                      <li key={pr.id} className="px-3 py-2 text-sm flex justify-between items-center">
                        <div>
                          <div className="font-medium flex items-center gap-1.5">
                            <BadgePercent className="size-3.5 text-amber-500" />
                            {pr.name ?? "Promoción"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {fmtDate(pr.valid_from)} – {fmtDate(pr.valid_to)}
                          </div>
                        </div>
                        <Badge variant="secondary">−{Number(pr.discount_pct ?? 0)}%</Badge>
                      </li>
                    ))}
                  </ul>
                )}
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

function Row({ label, value }: { label: string; value: any }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-4 text-sm border-b last:border-0 py-1.5">
      <span className="text-muted-foreground">{label}</span>
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

/**
 * Desglose fiscal. Recibe el precio final CON impuestos (como lo guarda `productos.precio_lista`)
 * y muestra: Subtotal → +IEPS → +IVA → Total. Fórmula:
 *   subtotal = precio / ((1 + iva) * (1 + ieps))
 *   ieps_amt = subtotal * ieps
 *   iva_amt  = (subtotal + ieps_amt) * iva
 */
function TaxBreakdown({
  precioConImpuestos,
  ivaPct,
  iepsPct,
  regimen,
}: {
  precioConImpuestos: number;
  ivaPct: number;
  iepsPct: number;
  regimen: string | null;
}) {
  const iva = ivaPct / 100;
  const ieps = iepsPct / 100;
  const denom = (1 + iva) * (1 + ieps);
  const subtotal = denom > 0 ? precioConImpuestos / denom : precioConImpuestos;
  const iepsAmt = subtotal * ieps;
  const ivaAmt = (subtotal + iepsAmt) * iva;
  const total = subtotal + iepsAmt + ivaAmt;

  return (
    <div className="rounded-md border divide-y text-sm">
      {regimen && (
        <div className="px-3 py-2 flex justify-between bg-muted/40">
          <span className="text-muted-foreground">Régimen SuiteTax</span>
          <span className="font-medium">{regimen}</span>
        </div>
      )}
      <div className="px-3 py-2 flex justify-between">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="tabular-nums">{fmt(subtotal)}</span>
      </div>
      {iepsPct > 0 && (
        <div className="px-3 py-2 flex justify-between">
          <span className="text-muted-foreground">IEPS ({iepsPct}%)</span>
          <span className="tabular-nums">{fmt(iepsAmt)}</span>
        </div>
      )}
      <div className="px-3 py-2 flex justify-between">
        <span className="text-muted-foreground">IVA ({ivaPct}%)</span>
        <span className="tabular-nums">{fmt(ivaAmt)}</span>
      </div>
      <div className="px-3 py-2 flex justify-between font-semibold bg-muted/30">
        <span>Total c/impuestos</span>
        <span className="tabular-nums text-primary">{fmt(total)}</span>
      </div>
    </div>
  );
}
