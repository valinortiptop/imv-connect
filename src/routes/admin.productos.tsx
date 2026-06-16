import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sortProducts } from "@/lib/sort-products";
import { ProductImageUpload } from "@/components/ProductImageUpload";
import { Product360Drawer } from "@/components/catalog/Product360Drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Plus,
  Upload,
  FileSpreadsheet,
  DollarSign,
  AlertCircle,
  BarChart3,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";

export const Route = createFileRoute("/admin/productos")({
  component: ProductosPage,
});

type Producto = {
  id: string;
  sku: string | null;
  nombre: string;
  descripcion: string | null;
  presentacion: string | null;
  categoria: string | null;
  laboratorio_id: string | null;
  imagen_url: string | null;
  precio_lista: number;
  unidad: string;
  iva_pct: number;
  activo: boolean;
  promo: boolean;
  marca: string | null;
  proveedor: string | null;
  peso_kg: number | null;
  costo_siva: number | null;
  costo_civa: number | null;
  bonificacion_pct: number | null;
  margen_normal_pct: number | null;
  margen_bonif_pct: number | null;
  stock_disponible: number;
  stock_en_camino: number;
  stock_comprometido: number;
  linea: string | null;
  grupo: string | null;
  tipo_producto: string | null;
  sat_clave: string | null;
  laboratorios?: { nombre: string } | null;
};

const mxnFmt = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});
const mxnFmt2 = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});
const numFmt = new Intl.NumberFormat("es-MX");

const pctFmt = (v: number | null) =>
  v == null ? "—" : `${Number(v).toFixed(1)}%`;

// Hash → palette for distribución por proveedor
const PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];
const colorFor = (k: string) => {
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
};

function ProductosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [proveedorFilter, setProveedorFilter] = useState("all");
  const [marcaFilter, setMarcaFilter] = useState("all");
  const [estadoFilter, setEstadoFilter] = useState<
    "todos" | "activos" | "inactivos" | "comprometidos" | "promo"
  >("todos");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Producto | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const productosQ = useQuery({
    queryKey: ["productos-catalogo"],
    queryFn: async () => {
      // Supabase caps responses at 1000 rows by default — paginate via range
      const pageSize = 1000;
      let from = 0;
      const all: unknown[] = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("productos")
          .select("*, laboratorios(nombre)")
          .order("nombre")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = data ?? [];
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }
      return sortProducts(all as unknown as Producto[]);
    },
  });

  const productos = productosQ.data ?? [];

  // Derived: marcas y proveedores únicos
  const { marcas, proveedores } = useMemo(() => {
    const m = new Set<string>();
    const p = new Set<string>();
    for (const x of productos) {
      if (x.marca) m.add(x.marca);
      if (x.proveedor) p.add(x.proveedor);
    }
    return {
      marcas: Array.from(m).sort(),
      proveedores: Array.from(p).sort(),
    };
  }, [productos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return productos.filter((p) => {
      if (q) {
        const hit =
          (p.sku ?? "").toLowerCase().includes(q) ||
          p.nombre.toLowerCase().includes(q) ||
          (p.marca ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (proveedorFilter !== "all" && p.proveedor !== proveedorFilter)
        return false;
      if (marcaFilter !== "all" && p.marca !== marcaFilter) return false;
      if (estadoFilter === "activos" && !p.activo) return false;
      if (estadoFilter === "inactivos" && p.activo) return false;
      if (estadoFilter === "comprometidos" && (p.stock_comprometido ?? 0) <= 0)
        return false;
      if (estadoFilter === "promo" && !p.promo) return false;
      return true;
    });
  }, [productos, search, proveedorFilter, marcaFilter, estadoFilter]);

  // KPIs
  const kpis = useMemo(() => {
    let valorBodega = 0;
    let comprometidos = 0;
    let bultos = 0;
    const porMarca: Record<string, number> = {};
    for (const p of productos) {
      valorBodega += (p.costo_civa ?? p.costo_siva ?? 0) * p.stock_disponible;
      comprometidos += p.stock_comprometido ?? 0;
      bultos += p.stock_disponible ?? 0;
      if (p.marca) porMarca[p.marca] = (porMarca[p.marca] ?? 0) + 1;
    }
    const distribucion = Object.entries(porMarca).sort((a, b) => b[1] - a[1]);
    return { valorBodega, comprometidos, bultos, distribucion };
  }, [productos]);

  // Top 5 productos por valor en inventario
  const top5 = useMemo(() => {
    const withValue = productos.map((p) => ({
      ...p,
      _valor: (p.costo_civa ?? p.costo_siva ?? 0) * p.stock_disponible,
    }));
    return withValue
      .filter((p) => p._valor > 0)
      .sort((a, b) => b._valor - a._valor)
      .slice(0, 5);
  }, [productos]);
  const top5Max = top5[0]?._valor ?? 1;

  const allFilteredIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const allSelected =
    allFilteredIds.length > 0 &&
    allFilteredIds.every((id) => selectedIds.has(id));

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };
  const toggleSelectAll = () => {
    if (allSelected) {
      const next = new Set(selectedIds);
      allFilteredIds.forEach((id) => next.delete(id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      allFilteredIds.forEach((id) => next.add(id));
      setSelectedIds(next);
    }
  };

  const bulkSet = useMutation({
    mutationFn: async (payload: { ids: string[]; activo?: boolean; del?: boolean }) => {
      if (payload.del) {
        const { error } = await supabase
          .from("productos")
          .delete()
          .in("id", payload.ids);
        if (error) throw error;
      } else if (payload.activo !== undefined) {
        const { error } = await supabase
          .from("productos")
          .update({ activo: payload.activo })
          .in("id", payload.ids);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Acción aplicada");
      qc.invalidateQueries({ queryKey: ["productos-catalogo"] });
      setSelectedIds(new Set());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Catálogo de Productos</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona tu catálogo de productos
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" /> Importar Excel
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Nuevo producto
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
          label="VALOR TOTAL EN BODEGA"
          accentBg="bg-emerald-500/10"
        >
          <div className="text-3xl font-bold">{mxnFmt.format(kpis.valorBodega)}</div>
        </KpiCard>
        <KpiCard
          icon={<AlertCircle className="h-4 w-4 text-amber-600" />}
          label="COMPROMETIDOS"
          accentBg="bg-amber-500/10"
        >
          <div className="flex gap-6">
            <div>
              <div className="text-3xl font-bold">{productos.length}</div>
              <div className="text-xs text-muted-foreground">Productos</div>
            </div>
            <div className="border-l border-border" />
            <div>
              <div className="text-3xl font-bold">
                {numFmt.format(kpis.bultos)}
              </div>
              <div className="text-xs text-muted-foreground">Bultos</div>
            </div>
          </div>
        </KpiCard>
        <KpiCard
          icon={<BarChart3 className="h-4 w-4 text-violet-600" />}
          label="DISTRIBUCIÓN POR PRODUCTO"
          accentBg="bg-violet-500/10"
        >
          <div className="space-y-2">
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              {kpis.distribucion.slice(0, 12).map(([m, n]) => (
                <div
                  key={m}
                  style={{
                    width: `${(n / productos.length) * 100}%`,
                    background: colorFor(m),
                  }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {kpis.distribucion.slice(0, 10).map(([m, n]) => (
                <span key={m} className="inline-flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: colorFor(m) }}
                  />
                  {m} <span className="font-semibold">{n}</span>
                </span>
              ))}
            </div>
          </div>
        </KpiCard>
      </div>

      {/* Top 5 */}
      {top5.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Top 5 productos por valor en inventario
            </span>
            <span className="text-muted-foreground">
              {mxnFmt.format(top5.reduce((s, p) => s + p._valor, 0))} total
            </span>
          </div>
          <div className="space-y-3">
            {top5.map((p, i) => (
              <div key={p.id} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span className="truncate">{p.nombre}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-xs">
                    <span className="text-muted-foreground">
                      {numFmt.format(p.stock_disponible)} bultos
                    </span>
                    <span className="font-bold">{mxnFmt.format(p._valor)}</span>
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${(p._valor / top5Max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por clave, nombre o marca…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={proveedorFilter} onValueChange={setProveedorFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Proveedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los proveedores</SelectItem>
            {proveedores.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={marcaFilter} onValueChange={setMarcaFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Marca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las marcas</SelectItem>
            {marcas.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex rounded-md border border-border bg-muted/30 p-0.5">
          {(["todos", "activos", "inactivos", "comprometidos", "promo"] as const).map(
            (k) => (
              <button
                key={k}
                onClick={() => setEstadoFilter(k)}
                className={
                  estadoFilter === k
                    ? "rounded bg-foreground px-3 py-1 text-xs font-medium text-background"
                    : "px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                {k[0].toUpperCase() + k.slice(1)}
              </button>
            ),
          )}
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        {filtered.length} / {productos.length} productos
      </div>

      {/* Bulk bar */}
      <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          {selectedIds.size} seleccionados
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={selectedIds.size === 0}
          onClick={() =>
            bulkSet.mutate({ ids: Array.from(selectedIds), activo: true })
          }
        >
          Activar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={selectedIds.size === 0}
          onClick={() =>
            bulkSet.mutate({ ids: Array.from(selectedIds), activo: false })
          }
        >
          Desactivar
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={selectedIds.size === 0}
          onClick={() => {
            if (confirm(`¿Eliminar ${selectedIds.size} productos?`))
              bulkSet.mutate({ ids: Array.from(selectedIds), del: true });
          }}
        >
          Eliminar
        </Button>
        {selectedIds.size > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            Deseleccionar
          </Button>
        )}
      </div>

      {/* Table */}
      {productosQ.isLoading && (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      )}
      {productosQ.error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {(productosQ.error as Error).message}
          <p className="mt-1 text-xs opacity-80">
            ¿Ya corriste{" "}
            <code>db/migrations/0011_fork_productos_extension.sql</code>?
          </p>
        </div>
      )}
      {productosQ.data && (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-24">Clave</TableHead>
                <TableHead className="w-14"></TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead className="text-right">Peso (KG)</TableHead>
                <TableHead className="text-right">Precio c/IVA</TableHead>
                <TableHead className="text-right">Margen</TableHead>
                <TableHead className="text-right">Margen c/bono</TableHead>
                <TableHead className="text-right">Disponible</TableHead>
                <TableHead className="text-right">En camino</TableHead>
                <TableHead className="text-right">Comp.</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow
                  key={p.id}
                  className={!p.activo ? "opacity-50" : ""}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(p.id)}
                      onCheckedChange={() => toggleSelect(p.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-primary">
                    {p.sku ?? "—"}
                  </TableCell>
                  <TableCell>
                    {p.imagen_url ? (
                      <img
                        src={p.imagen_url}
                        alt=""
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="truncate max-w-[260px]">{p.nombre}</span>
                      {p.promo && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        >
                          Promo
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.marca ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.proveedor ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.peso_kg ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {mxnFmt.format(p.precio_lista)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="text-amber-600">
                      {pctFmt(p.margen_normal_pct)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="text-emerald-600">
                      {pctFmt(p.margen_bonif_pct)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600 font-semibold">
                    {numFmt.format(p.stock_disponible)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {numFmt.format(p.stock_en_camino)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {numFmt.format(p.stock_comprometido)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(p)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={14}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    Sin resultados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <EditProductDialog
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["productos-catalogo"] });
            setEditing(null);
          }}
        />
      )}
      {newOpen && (
        <NewProductDialog
          onClose={() => setNewOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["productos-catalogo"] });
            setNewOpen(false);
          }}
        />
      )}
      {importOpen && (
        <ImportExcelDialog
          onClose={() => setImportOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["productos-catalogo"] });
            setImportOpen(false);
          }}
        />
      )}
    </section>
  );
}

function KpiCard({
  icon,
  label,
  accentBg,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  accentBg: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded ${accentBg}`}
        >
          {icon}
        </span>
        <span className="text-xs font-semibold tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

// =============================================================
// Edit product dialog — stock / precios / márgenes con recalc
// =============================================================
function EditProductDialog({
  product,
  onClose,
  onSaved,
}: {
  product: Producto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clave, setClave] = useState(product.sku ?? "");
  const [costoSiva, setCostoSiva] = useState(String(product.costo_siva ?? ""));
  const [costoCiva, setCostoCiva] = useState(String(product.costo_civa ?? ""));
  const [precio, setPrecio] = useState(String(product.precio_lista ?? ""));
  const [bono, setBono] = useState(String(product.bonificacion_pct ?? "7"));
  const [margenNormal, setMargenNormal] = useState(
    String(product.margen_normal_pct ?? ""),
  );
  const [margenBono, setMargenBono] = useState(
    String(product.margen_bonif_pct ?? ""),
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageRemove, setImageRemove] = useState(false);
  const [saving, setSaving] = useState(false);

  // === Recalc bidireccional ===
  const onCostChange = (s: string) => {
    setCostoSiva(s);
    const cost = parseFloat(s);
    if (!isNaN(cost)) setCostoCiva((cost * 1.16).toFixed(2));
    const price = parseFloat(precio);
    if (isNaN(cost) || isNaN(price) || price === 0) return;
    const priceWithoutIva = price / 1.16;
    const b = parseFloat(bono) || 0;
    const costBono = cost * (1 - b / 100);
    setMargenNormal(
      (((priceWithoutIva - cost) / priceWithoutIva) * 100).toFixed(2),
    );
    setMargenBono(
      (((priceWithoutIva - costBono) / priceWithoutIva) * 100).toFixed(2),
    );
  };
  const onPriceChange = (s: string) => {
    setPrecio(s);
    const price = parseFloat(s);
    const cost = parseFloat(costoSiva);
    if (isNaN(cost) || isNaN(price) || price === 0) return;
    const priceWithoutIva = price / 1.16;
    const b = parseFloat(bono) || 0;
    const costBono = cost * (1 - b / 100);
    setMargenNormal(
      (((priceWithoutIva - cost) / priceWithoutIva) * 100).toFixed(2),
    );
    setMargenBono(
      (((priceWithoutIva - costBono) / priceWithoutIva) * 100).toFixed(2),
    );
  };
  const onMarginChange = (s: string, withBonus: boolean) => {
    if (withBonus) setMargenBono(s);
    else setMargenNormal(s);
    const margin = parseFloat(s);
    const cost = parseFloat(costoSiva);
    if (isNaN(margin) || isNaN(cost) || margin >= 100) return;
    const b = parseFloat(bono) || 0;
    const effectiveCost = withBonus ? cost * (1 - b / 100) : cost;
    const priceWithoutIva = effectiveCost / (1 - margin / 100);
    const priceWithIva = priceWithoutIva * 1.16;
    setPrecio(Math.round(priceWithIva).toString());
    if (withBonus) {
      setMargenNormal(
        (((priceWithoutIva - cost) / priceWithoutIva) * 100).toFixed(2),
      );
    } else {
      const costBono = cost * (1 - b / 100);
      setMargenBono(
        (((priceWithoutIva - costBono) / priceWithoutIva) * 100).toFixed(2),
      );
    }
  };
  const onBonoChange = (s: string) => {
    setBono(s);
    const cost = parseFloat(costoSiva);
    const price = parseFloat(precio);
    if (isNaN(cost) || isNaN(price) || price === 0) return;
    const priceWithoutIva = price / 1.16;
    const b = parseFloat(s) || 0;
    const costBono = cost * (1 - b / 100);
    setMargenBono(
      (((priceWithoutIva - costBono) / priceWithoutIva) * 100).toFixed(2),
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      let imagen_url: string | null | undefined = undefined;
      if (imageRemove) imagen_url = null;
      if (imageFile) {
        const ext = imageFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `productos/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("productos")
          .upload(path, imageFile, { contentType: imageFile.type });
        if (upErr) throw upErr;
        imagen_url = supabase.storage.from("productos").getPublicUrl(path).data
          .publicUrl;
      }
      const patch: Record<string, unknown> = {
        sku: clave.trim() || null,
        costo_siva: costoSiva ? Number(costoSiva) : null,
        costo_civa: costoCiva ? Number(costoCiva) : null,
        precio_lista: Number(precio) || 0,
        bonificacion_pct: Number(bono) || 0,
        margen_normal_pct: margenNormal ? Number(margenNormal) : null,
        margen_bonif_pct: margenBono ? Number(margenBono) : null,
      };
      if (imagen_url !== undefined) patch.imagen_url = imagen_url;
      const { error } = await supabase
        .from("productos")
        .update(patch)
        .eq("id", product.id);
      if (error) throw error;
      toast.success("Producto actualizado");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Editar Producto{" "}
            <span className="font-mono text-sm text-primary">{product.sku}</span>
          </DialogTitle>
          <DialogDescription>{product.nombre}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Imagen */}
          <div className="space-y-4">
            <ProductImageUpload
              currentUrl={product.imagen_url}
              pendingFile={imageFile}
              onFile={setImageFile}
              markForRemoval={imageRemove}
              onMarkForRemoval={setImageRemove}
            />
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground">
                INFORMACIÓN
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">SKU / CLAVE</Label>
                  <Input
                    value={clave}
                    onChange={(e) => setClave(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">PROVEEDOR</Label>
                    <div className="mt-1 text-sm">{product.proveedor ?? "—"}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">MARCA</Label>
                    <div className="mt-1 text-sm">{product.marca ?? "—"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stock / Precios / Márgenes */}
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground">
                STOCK
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-2xl font-bold text-emerald-600">
                    {numFmt.format(product.stock_disponible)}
                  </div>
                  <div className="text-[10px] tracking-wider text-muted-foreground">
                    DISPONIBLE
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {numFmt.format(product.stock_en_camino)}
                  </div>
                  <div className="text-[10px] tracking-wider text-muted-foreground">
                    EN CAMINO
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {numFmt.format(product.stock_comprometido)}
                  </div>
                  <div className="text-[10px] tracking-wider text-muted-foreground">
                    COMPROMETIDO
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground">
                PRECIOS
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">COSTO S/IVA</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={costoSiva}
                    onChange={(e) => onCostChange(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">COSTO C/IVA</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={costoCiva}
                    onChange={(e) => setCostoCiva(e.target.value)}
                    className="mt-1 bg-muted/40"
                    readOnly
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    PRECIO VENTA C/IVA
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={precio}
                    onChange={(e) => onPriceChange(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">BONIFICACIÓN %</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={bono}
                    onChange={(e) => onBonoChange(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground">
                MÁRGENES
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    MARGEN NORMAL %
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={margenNormal}
                    onChange={(e) => onMarginChange(e.target.value, false)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    MARGEN C/BONIF %
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={margenBono}
                    onChange={(e) => onMarginChange(e.target.value, true)}
                    className="mt-1"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Edita margen o precio — el otro se recalcula automáticamente
              </p>
            </div>

            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Actualizar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================
// New product dialog (versión compacta)
// =============================================================
function NewProductDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState({
    sku: "",
    nombre: "",
    marca: "",
    proveedor: "",
    peso_kg: "",
    precio_lista: "",
    costo_siva: "",
    bonificacion_pct: "7",
    activo: true,
  });
  const [labId, setLabId] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const labsQ = useQuery({
    queryKey: ["labs-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("laboratorios")
        .select("id, nombre")
        .order("nombre");
      if (error) throw error;
      return data as { id: string; nombre: string }[];
    },
  });

  const save = async () => {
    if (!v.nombre.trim()) return toast.error("Nombre requerido");
    if (!labId) return toast.error("Selecciona laboratorio");
    setSaving(true);
    try {
      let imagen_url: string | null = null;
      if (imageFile) {
        const ext = imageFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `productos/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("productos")
          .upload(path, imageFile, { contentType: imageFile.type });
        if (upErr) throw upErr;
        imagen_url = supabase.storage.from("productos").getPublicUrl(path).data
          .publicUrl;
      }
      const costo = v.costo_siva ? Number(v.costo_siva) : null;
      const { error } = await supabase.from("productos").insert({
        sku: v.sku.trim() || null,
        nombre: v.nombre.trim(),
        laboratorio_id: labId,
        marca: v.marca.trim() || null,
        proveedor: v.proveedor.trim() || null,
        peso_kg: v.peso_kg ? Number(v.peso_kg) : null,
        precio_lista: Number(v.precio_lista) || 0,
        costo_siva: costo,
        costo_civa: costo ? Number((costo * 1.16).toFixed(2)) : null,
        bonificacion_pct: Number(v.bonificacion_pct) || 0,
        activo: v.activo,
        imagen_url,
      });
      if (error) throw error;
      toast.success("Producto creado");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo producto</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <ProductImageUpload
            currentUrl={null}
            pendingFile={imageFile}
            onFile={setImageFile}
            height="md"
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU / Clave">
              <Input
                value={v.sku}
                onChange={(e) => setV({ ...v, sku: e.target.value })}
              />
            </Field>
            <Field label="Laboratorio *">
              <Select value={labId} onValueChange={setLabId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona…" />
                </SelectTrigger>
                <SelectContent>
                  {(labsQ.data ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Nombre *" span={2}>
              <Input
                value={v.nombre}
                onChange={(e) => setV({ ...v, nombre: e.target.value })}
              />
            </Field>
            <Field label="Marca">
              <Input
                value={v.marca}
                onChange={(e) => setV({ ...v, marca: e.target.value })}
              />
            </Field>
            <Field label="Proveedor">
              <Input
                value={v.proveedor}
                onChange={(e) => setV({ ...v, proveedor: e.target.value })}
              />
            </Field>
            <Field label="Peso (kg)">
              <Input
                type="number"
                step="0.01"
                value={v.peso_kg}
                onChange={(e) => setV({ ...v, peso_kg: e.target.value })}
              />
            </Field>
            <Field label="Precio c/IVA *">
              <Input
                type="number"
                step="0.01"
                value={v.precio_lista}
                onChange={(e) => setV({ ...v, precio_lista: e.target.value })}
              />
            </Field>
            <Field label="Costo s/IVA">
              <Input
                type="number"
                step="0.01"
                value={v.costo_siva}
                onChange={(e) => setV({ ...v, costo_siva: e.target.value })}
              />
            </Field>
            <Field label="Bonificación %">
              <Input
                type="number"
                step="0.01"
                value={v.bonificacion_pct}
                onChange={(e) => setV({ ...v, bonificacion_pct: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Crear"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  span,
}: {
  label: string;
  children: React.ReactNode;
  span?: number;
}) {
  return (
    <div className={span === 2 ? "col-span-2" : ""}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// =============================================================
// Import Excel — preview + insert
// =============================================================
type ImportRow = {
  sku: string;
  nombre: string;
  marca: string;
  proveedor: string;
  peso_kg: number | null;
  precio_lista: number | null;
  status: "new" | "exists" | "error";
  errorMsg?: string;
};

function ImportExcelDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [labId, setLabId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const labsQ = useQuery({
    queryKey: ["labs-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("laboratorios")
        .select("id, nombre")
        .order("nombre");
      if (error) throw error;
      return data as { id: string; nombre: string }[];
    },
  });

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const XLSX = await import("xlsx-js-style");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);

      const { data: existing } = await supabase
        .from("productos")
        .select("sku")
        .not("sku", "is", null);
      const existingSkus = new Set(
        (existing ?? []).map((p) => (p.sku as string).toLowerCase()),
      );

      const parsed: ImportRow[] = json.map((r) => {
        const get = (...keys: string[]) => {
          for (const k of keys) {
            for (const real of Object.keys(r)) {
              if (real.toLowerCase().trim() === k.toLowerCase())
                return String(r[real] ?? "").trim();
            }
          }
          return "";
        };
        const sku = get("clave", "sku");
        const nombre = get("nombre", "producto", "name");
        const marca = get("marca", "brand");
        const proveedor = get("proveedor", "supplier");
        const peso = get("peso", "peso_kg", "weight_kg");
        const precio = get("precio", "precio_civa", "precio c/iva", "price");

        if (!nombre) {
          return {
            sku,
            nombre,
            marca,
            proveedor,
            peso_kg: null,
            precio_lista: null,
            status: "error",
            errorMsg: "Falta nombre",
          };
        }
        const lower = sku.toLowerCase();
        return {
          sku,
          nombre,
          marca,
          proveedor,
          peso_kg: peso ? Number(peso) : null,
          precio_lista: precio ? Number(precio) : null,
          status: lower && existingSkus.has(lower) ? "exists" : "new",
        };
      });
      setRows(parsed);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    if (!labId) return toast.error("Selecciona laboratorio destino");
    const toInsert = rows.filter((r) => r.status === "new");
    if (toInsert.length === 0) return toast.info("Nada nuevo por importar");
    setSaving(true);
    try {
      const payload = toInsert.map((r) => ({
        sku: r.sku || null,
        nombre: r.nombre,
        marca: r.marca || null,
        proveedor: r.proveedor || null,
        peso_kg: r.peso_kg,
        precio_lista: r.precio_lista ?? 0,
        laboratorio_id: labId,
        activo: true,
      }));
      const { error } = await supabase.from("productos").insert(payload);
      if (error) throw error;
      toast.success(`${payload.length} productos importados`);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => {
    return {
      new: rows.filter((r) => r.status === "new").length,
      exists: rows.filter((r) => r.status === "exists").length,
      err: rows.filter((r) => r.status === "error").length,
    };
  }, [rows]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar productos desde Excel
          </DialogTitle>
          <DialogDescription>
            Columnas reconocidas: <code>clave</code>, <code>nombre</code>,{" "}
            <code>marca</code>, <code>proveedor</code>, <code>peso</code>,{" "}
            <code>precio</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">
                Laboratorio destino
              </Label>
              <Select value={labId} onValueChange={setLabId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecciona…" />
                </SelectTrigger>
                <SelectContent>
                  {(labsQ.data ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={parsing}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              {parsing ? "Analizando…" : "Seleccionar archivo"}
            </Button>
          </div>

          {rows.length > 0 && (
            <>
              <div className="flex gap-2 text-xs">
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600">
                  Nuevos: {counts.new}
                </Badge>
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600">
                  Ya existen: {counts.exists}
                </Badge>
                <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                  Errores: {counts.err}
                </Badge>
              </div>

              <div className="max-h-[380px] overflow-y-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Estado</TableHead>
                      <TableHead>Clave</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {r.status === "new" && (
                            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40">
                              <Check className="mr-1 h-3 w-3" /> Nuevo
                            </Badge>
                          )}
                          {r.status === "exists" && (
                            <Badge variant="outline" className="text-muted-foreground">
                              Existe
                            </Badge>
                          )}
                          {r.status === "error" && (
                            <Badge variant="destructive">{r.errorMsg}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.sku || "—"}</TableCell>
                        <TableCell>{r.nombre || "—"}</TableCell>
                        <TableCell>{r.marca || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.precio_lista != null ? mxnFmt2.format(r.precio_lista) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving || counts.new === 0}>
              {saving ? "Importando…" : `Importar ${counts.new} productos`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
