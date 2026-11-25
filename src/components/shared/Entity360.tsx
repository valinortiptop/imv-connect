import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Panel360, rowClickProps } from "@/components/shared/Panel360";
import { Product360Drawer } from "@/components/catalog/Product360Drawer";

const mxn = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

/** Texto clicable que abre una vista 360. */
export function EntityLink({ onOpen, children, className = "" }: { onOpen: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }}
      className={`text-left underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm ${className}`}>
      {children}
    </button>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-sm font-medium">{value ?? "—"}</div></div>;
}

type OCRow = { id: string; folio: string; estado: string; fecha_emision: string; total: number };

function OCList({ rows }: { rows: OCRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sin órdenes de compra.</p>;
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {rows.map((o) => (
        <li key={o.id}>
          <Link to="/admin/compras/$id" params={{ id: o.id }} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50">
            <span className="font-medium">{o.folio}</span>
            <span className="text-xs text-muted-foreground">{o.fecha_emision} · {o.estado}</span>
            <span className="tabular-nums">{mxn(o.total)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProductList({ rows, onOpen }: { rows: { id: string; nombre: string; sku: string | null; extra?: ReactNode }[]; onOpen: (id: string) => void }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sin productos.</p>;
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {rows.map((p) => (
        <li key={p.id} {...rowClickProps(() => onOpen(p.id))} >
          <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span><span className="font-medium">{p.nombre}</span> <span className="text-xs text-muted-foreground">{p.sku ?? ""}</span></span>
            {p.extra}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Laboratorio360Drawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [prod, setProd] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["lab-360", id],
    enabled: !!id,
    queryFn: async () => {
      const [lab, prods, ocs] = await Promise.all([
        supabase.from("laboratorios").select("*").eq("id", id!).single(),
        supabase.from("productos").select("id, nombre, sku, activo").eq("laboratorio_id", id!).order("nombre").limit(500),
        supabase.from("ordenes_compra").select("id, folio, estado, fecha_emision, total").eq("laboratorio_id", id!).order("fecha_emision", { ascending: false }).limit(20),
      ]);
      if (lab.error) throw lab.error;
      return { lab: lab.data, prods: prods.data ?? [], ocs: (ocs.data ?? []) as OCRow[] };
    },
  });
  const d = q.data;
  return (
    <>
      <Panel360 open={!!id} onOpenChange={(o) => !o && onClose()} title={d?.lab.nombre ?? "Laboratorio 360"} description="Laboratorio / proveedor">
        {q.isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : q.isError ? <p className="text-sm text-destructive">No se pudo cargar.</p> : d && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
              <Field label="RFC" value={d.lab.rfc} />
              <Field label="País" value={d.lab.pais} />
              <Field label="Tipo de tercero" value={d.lab.tipo_tercero} />
              <Field label="Operación" value={d.lab.tipo_operacion} />
              <Field label="Estado" value={d.lab.activo ? "Activo" : "Inactivo"} />
              <Field label="Productos" value={d.prods.length} />
            </div>
            <section><h4 className="mb-2 text-sm font-semibold">Órdenes de compra recientes</h4><OCList rows={d.ocs} /></section>
            <section><h4 className="mb-2 text-sm font-semibold">Productos</h4>
              <ProductList rows={d.prods.map((p) => ({ ...p, extra: p.activo ? null : <span className="text-xs text-muted-foreground">inactivo</span> }))} onOpen={setProd} />
            </section>
          </div>
        )}
      </Panel360>
      <Product360Drawer productId={prod} open={!!prod} onOpenChange={(o) => !o && setProd(null)} />
    </>
  );
}

export function Almacen360Drawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [prod, setProd] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["almacen-360", id],
    enabled: !!id,
    queryFn: async () => {
      const [alm, stock, ocs] = await Promise.all([
        supabase.from("almacenes").select("*").eq("id", id!).single(),
        supabase.from("stock").select("cantidad, productos(id, nombre, sku)").eq("almacen_id", id!).gt("cantidad", 0).order("cantidad", { ascending: false }).limit(200),
        supabase.from("ordenes_compra").select("id, folio, estado, fecha_emision, total").eq("almacen_id", id!).order("fecha_emision", { ascending: false }).limit(20),
      ]);
      if (alm.error) throw alm.error;
      const rows = ((stock.data ?? []) as unknown as { cantidad: number; productos: { id: string; nombre: string; sku: string | null } | null }[])
        .filter((s) => s.productos).map((s) => ({ ...s.productos!, cantidad: Number(s.cantidad) }));
      return { alm: alm.data, stock: rows, ocs: (ocs.data ?? []) as OCRow[] };
    },
  });
  const d = q.data;
  return (
    <>
      <Panel360 open={!!id} onOpenChange={(o) => !o && onClose()} title={d?.alm.nombre ?? "Almacén 360"} description="Almacén">
        {q.isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : q.isError ? <p className="text-sm text-destructive">No se pudo cargar.</p> : d && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
              <Field label="Código" value={d.alm.codigo} />
              <Field label="Dirección" value={d.alm.direccion} />
              <Field label="Principal" value={d.alm.principal ? "Sí" : "No"} />
              <Field label="Estado" value={d.alm.activo ? "Activo" : "Inactivo"} />
              <Field label="Productos con existencia" value={d.stock.length} />
            </div>
            <section><h4 className="mb-2 text-sm font-semibold">Órdenes de compra recientes</h4><OCList rows={d.ocs} /></section>
            <section><h4 className="mb-2 text-sm font-semibold">Existencias</h4>
              <ProductList rows={d.stock.map((s) => ({ ...s, extra: <span className="tabular-nums">{s.cantidad}</span> }))} onOpen={setProd} />
            </section>
          </div>
        )}
      </Panel360>
      <Product360Drawer productId={prod} open={!!prod} onOpenChange={(o) => !o && setProd(null)} />
    </>
  );
}
