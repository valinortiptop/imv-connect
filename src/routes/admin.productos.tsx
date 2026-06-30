import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sortProducts } from "@/lib/sort-products";
import { ProductImageUpload } from "@/components/ProductImageUpload";
import { Product360Drawer } from "@/components/catalog/Product360Drawer";
import { ProductImagesOneDriveDialog } from "@/components/catalog/ProductImagesOneDriveDialog";
import { ProductImagesZipDialog } from "@/components/catalog/ProductImagesZipDialog";
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
  Sparkles,
} from "lucide-react";
import { aiChatFn } from "@/lib/valinor.functions";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

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
  const [lineaFilter, setLineaFilter] = useState("all");
  const [grupoFilter, setGrupoFilter] = useState("all");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [estadoFilter, setEstadoFilter] = useState<
    "todos" | "activos" | "inactivos" | "comprometidos" | "promo"
  >("todos");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Producto | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [imagesImportOpen, setImagesImportOpen] = useState(false);
  const [imagesZipOpen, setImagesZipOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<
    "valor" | "comprometidos" | "distribucion" | null
  >(null);

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

  // Derived: marcas, proveedores, taxonomía únicos
  const { marcas, proveedores, lineas, grupos, tipos } = useMemo(() => {
    const m = new Set<string>();
    const p = new Set<string>();
    const li = new Set<string>();
    const gr = new Set<string>();
    const ti = new Set<string>();
    for (const x of productos) {
      if (x.marca) m.add(x.marca);
      if (x.proveedor) p.add(x.proveedor);
      if (x.linea) li.add(x.linea);
      if (x.grupo) gr.add(x.grupo);
      if (x.tipo_producto) ti.add(x.tipo_producto);
    }
    return {
      marcas: Array.from(m).sort(),
      proveedores: Array.from(p).sort(),
      lineas: Array.from(li).sort(),
      grupos: Array.from(gr).sort(),
      tipos: Array.from(ti).sort(),
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
      if (lineaFilter !== "all" && p.linea !== lineaFilter) return false;
      if (grupoFilter !== "all" && p.grupo !== grupoFilter) return false;
      if (tipoFilter !== "all" && p.tipo_producto !== tipoFilter) return false;
      if (estadoFilter === "activos" && !p.activo) return false;
      if (estadoFilter === "inactivos" && p.activo) return false;
      if (estadoFilter === "comprometidos" && (p.stock_comprometido ?? 0) <= 0)
        return false;
      if (estadoFilter === "promo" && !p.promo) return false;
      return true;
    });
  }, [productos, search, proveedorFilter, marcaFilter, lineaFilter, grupoFilter, tipoFilter, estadoFilter]);

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
          <Button variant="outline" onClick={() => setImagesZipOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" /> Importar imágenes (ZIP)
          </Button>
          <Button variant="outline" onClick={() => setImagesImportOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" /> Importar imágenes (OneDrive)
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
          onClick={() => setDetailOpen("valor")}
        >
          <div className="text-3xl font-bold">{mxnFmt.format(kpis.valorBodega)}</div>
        </KpiCard>
        <KpiCard
          icon={<AlertCircle className="h-4 w-4 text-amber-600" />}
          label="COMPROMETIDOS"
          accentBg="bg-amber-500/10"
          onClick={() => setDetailOpen("comprometidos")}
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
          onClick={() => setDetailOpen("distribucion")}
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
            placeholder="Buscar por clave, nombre o clase…"
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
            <SelectValue placeholder="Clase" />
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
        <Select value={lineaFilter} onValueChange={setLineaFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Línea" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las líneas</SelectItem>
            {lineas.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={grupoFilter} onValueChange={setGrupoFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Grupo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los grupos</SelectItem>
            {grupos.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {tipos.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
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
                <TableHead>Clase</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead>Tipo</TableHead>
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
                  <TableCell
                    className="font-mono text-xs text-primary cursor-pointer hover:underline"
                    onClick={() => setDrawerId(p.id)}
                  >
                    {p.sku ?? "—"}
                  </TableCell>
                  <TableCell onClick={() => setDrawerId(p.id)} className="cursor-pointer">
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
                  <TableCell>
                    {p.linea ? <Badge variant="outline" className="text-[10px]">{p.linea}</Badge> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {p.grupo ? <Badge variant="secondary" className="text-[10px]">{p.grupo}</Badge> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {p.tipo_producto ? <Badge className="text-[10px]">{p.tipo_producto}</Badge> : <span className="text-muted-foreground">—</span>}
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
                    colSpan={17}
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
      <ProductImagesOneDriveDialog
        open={imagesImportOpen}
        onOpenChange={setImagesImportOpen}
      />
      <ProductImagesZipDialog
        open={imagesZipOpen}
        onOpenChange={setImagesZipOpen}
      />
      <Product360Drawer
        productId={drawerId}
        open={!!drawerId}
        onOpenChange={(o) => !o && setDrawerId(null)}
      />
      <KpiDetailDialog
        open={detailOpen}
        onClose={() => setDetailOpen(null)}
        productos={productos}
        kpis={kpis}
        onApplyFilter={(f) => {
          setEstadoFilter(f);
          setDetailOpen(null);
        }}
      />
    </section>
  );
}

function KpiCard({
  icon,
  label,
  accentBg,
  children,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  accentBg: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "group relative rounded-lg border border-border bg-card p-4 transition-all",
        clickable &&
          "cursor-pointer hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded ${accentBg}`}
        >
          {icon}
        </span>
        <span className="text-xs font-semibold tracking-wider text-muted-foreground">
          {label}
        </span>
        {clickable && (
          <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            Ver detalle →
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// =============================================================
// KPI Detail dialog — drill-down with dynamic charts
// =============================================================
type EstadoFilter =
  | "todos"
  | "activos"
  | "inactivos"
  | "comprometidos"
  | "promo";

function KpiDetailDialog({
  open,
  onClose,
  productos,
  kpis,
  onApplyFilter,
}: {
  open: "valor" | "comprometidos" | "distribucion" | null;
  onClose: () => void;
  productos: Producto[];
  kpis: {
    valorBodega: number;
    comprometidos: number;
    bultos: number;
    distribucion: [string, number][];
  };
  onApplyFilter: (f: EstadoFilter) => void;
}) {
  const analytics = useMemo(() => {
    const withVal = productos.map((p) => ({
      ...p,
      _valor: (p.costo_civa ?? p.costo_siva ?? 0) * (p.stock_disponible ?? 0),
    }));
    const conStock = withVal.filter((p) => (p.stock_disponible ?? 0) > 0);
    const valorPorMarca = new Map<string, number>();
    const valorPorLinea = new Map<string, number>();
    for (const p of withVal) {
      const m = p.marca || "Sin marca";
      valorPorMarca.set(m, (valorPorMarca.get(m) ?? 0) + p._valor);
      const l = p.linea || "Sin línea";
      valorPorLinea.set(l, (valorPorLinea.get(l) ?? 0) + p._valor);
    }
    const topValor = [...withVal]
      .filter((p) => p._valor > 0)
      .sort((a, b) => b._valor - a._valor)
      .slice(0, 10);
    const topComprometidos = [...productos]
      .filter((p) => (p.stock_comprometido ?? 0) > 0)
      .sort(
        (a, b) => (b.stock_comprometido ?? 0) - (a.stock_comprometido ?? 0)
      )
      .slice(0, 10);
    const totDisp = productos.reduce(
      (s, p) => s + (p.stock_disponible ?? 0),
      0
    );
    const totComp = productos.reduce(
      (s, p) => s + (p.stock_comprometido ?? 0),
      0
    );
    const activos = productos.filter((p) => p.activo).length;
    const promos = productos.filter((p) => p.promo).length;
    const porLinea = new Map<string, number>();
    const porTipo = new Map<string, number>();
    for (const p of productos) {
      const l = p.linea || "Sin línea";
      porLinea.set(l, (porLinea.get(l) ?? 0) + 1);
      const t = p.tipo_producto || "Sin tipo";
      porTipo.set(t, (porTipo.get(t) ?? 0) + 1);
    }
    return {
      withVal,
      conStock,
      valorPorMarca: [...valorPorMarca.entries()].sort((a, b) => b[1] - a[1]),
      valorPorLinea: [...valorPorLinea.entries()].sort((a, b) => b[1] - a[1]),
      topValor,
      topComprometidos,
      totDisp,
      totComp,
      activos,
      promos,
      porLinea: [...porLinea.entries()].sort((a, b) => b[1] - a[1]),
      porTipo: [...porTipo.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [productos]);

  const title =
    open === "valor"
      ? "Valor total en bodega"
      : open === "comprometidos"
        ? "Inventario y compromiso"
        : open === "distribucion"
          ? "Distribución del catálogo"
          : "";

  return (
    <Dialog open={!!open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Análisis en vivo basado en tu catálogo actual.
          </DialogDescription>
        </DialogHeader>

        {open === "valor" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatBox
                label="Valor total"
                value={mxnFmt.format(kpis.valorBodega)}
              />
              <StatBox
                label="Productos con stock"
                value={numFmt.format(analytics.conStock.length)}
              />
              <StatBox
                label="Valor promedio"
                value={mxnFmt.format(
                  analytics.conStock.length
                    ? kpis.valorBodega / analytics.conStock.length
                    : 0
                )}
              />
              <StatBox
                label="Bultos totales"
                value={numFmt.format(analytics.totDisp)}
              />
            </div>

            <ChartCard title="Valor por clase (Top 10)">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={analytics.valorPorMarca
                    .slice(0, 10)
                    .map(([name, value]) => ({ name, value }))}
                  margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                >
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number) => mxnFmt.format(v)}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {analytics.valorPorMarca.slice(0, 10).map(([name]) => (
                      <Cell key={name} fill={colorFor(name)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top 10 productos por valor">
              <div className="space-y-2">
                {analytics.topValor.map((p, i) => {
                  const max = analytics.topValor[0]?._valor || 1;
                  return (
                    <div key={p.id} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="truncate">
                          {i + 1}. {p.nombre}
                        </span>
                        <span className="font-semibold">
                          {mxnFmt.format(p._valor)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(p._valor / max) * 100}%`,
                            background: colorFor(p.marca || p.nombre),
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </ChartCard>
          </div>
        )}

        {open === "comprometidos" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatBox
                label="Bultos disponibles"
                value={numFmt.format(analytics.totDisp)}
              />
              <StatBox
                label="Bultos comprometidos"
                value={numFmt.format(analytics.totComp)}
              />
              <StatBox
                label="Productos con compromiso"
                value={numFmt.format(analytics.topComprometidos.length)}
              />
              <StatBox
                label="% comprometido"
                value={`${
                  analytics.totDisp + analytics.totComp > 0
                    ? Math.round(
                        (analytics.totComp /
                          (analytics.totDisp + analytics.totComp)) *
                          100
                      )
                    : 0
                }%`}
              />
            </div>

            <ChartCard title="Disponible vs Comprometido">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Disponible", value: analytics.totDisp },
                      { name: "Comprometido", value: analytics.totComp },
                    ]}
                    dataKey="value"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#f59e0b" />
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => numFmt.format(v)}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top productos comprometidos">
              {analytics.topComprometidos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay productos comprometidos actualmente.
                </p>
              ) : (
                <div className="space-y-2">
                  {analytics.topComprometidos.map((p) => {
                    const max =
                      analytics.topComprometidos[0]?.stock_comprometido ?? 1;
                    return (
                      <div key={p.id} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="truncate">{p.nombre}</span>
                          <span className="font-semibold">
                            {numFmt.format(p.stock_comprometido ?? 0)} /{" "}
                            {numFmt.format(p.stock_disponible ?? 0)}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{
                              width: `${
                                ((p.stock_comprometido ?? 0) / (max || 1)) * 100
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ChartCard>

            <div className="flex justify-end">
              <Button onClick={() => onApplyFilter("comprometidos")}>
                Ver solo comprometidos
              </Button>
            </div>
          </div>
        )}

        {open === "distribucion" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatBox
                label="Total productos"
                value={numFmt.format(productos.length)}
              />
              <StatBox
                label="Activos"
                value={`${analytics.activos} (${
                  productos.length
                    ? Math.round((analytics.activos / productos.length) * 100)
                    : 0
                }%)`}
              />
              <StatBox
                label="En promoción"
                value={numFmt.format(analytics.promos)}
              />
              <StatBox
                label="Clases"
                value={numFmt.format(kpis.distribucion.length)}
              />
            </div>

            <ChartCard title="Distribución por clase">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={kpis.distribucion
                      .slice(0, 12)
                      .map(([name, value]) => ({ name, value }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={100}
                    paddingAngle={1}
                  >
                    {kpis.distribucion.slice(0, 12).map(([name]) => (
                      <Cell key={name} fill={colorFor(name)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {kpis.distribucion.slice(0, 16).map(([m, n]) => (
                  <span key={m} className="inline-flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: colorFor(m) }}
                    />
                    {m} <span className="font-semibold">{n}</span>
                  </span>
                ))}
              </div>
            </ChartCard>

            <div className="grid gap-4 md:grid-cols-2">
              <ChartCard title="Productos por línea (Top 8)">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={analytics.porLinea
                      .slice(0, 8)
                      .map(([name, value]) => ({ name, value }))}
                    layout="vertical"
                    margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{ fontSize: 11 }}
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                    <Bar
                      dataKey="value"
                      fill="#8b5cf6"
                      radius={[0, 6, 6, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Productos por tipo">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={analytics.porTipo
                      .slice(0, 8)
                      .map(([name, value]) => ({ name, value }))}
                    layout="vertical"
                    margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{ fontSize: 11 }}
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                    <Bar
                      dataKey="value"
                      fill="#3b82f6"
                      radius={[0, 6, 6, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 text-sm font-semibold">{title}</div>
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
  const [linea, setLinea] = useState(product.linea ?? "");
  const [grupo, setGrupo] = useState(product.grupo ?? "");
  const [tipoProducto, setTipoProducto] = useState(product.tipo_producto ?? "");
  const [satClave, setSatClave] = useState(product.sat_clave ?? "");
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
        linea: linea.trim() || null,
        grupo: grupo.trim() || null,
        tipo_producto: tipoProducto.trim() || null,
        sat_clave: satClave.trim() || null,
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
                    <Label className="text-xs text-muted-foreground">CLASE</Label>
                    <div className="mt-1 text-sm">{product.marca ?? "—"}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                  <div>
                    <Label className="text-xs text-muted-foreground">LÍNEA</Label>
                    <Input value={linea} onChange={(e) => setLinea(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">GRUPO</Label>
                    <Input value={grupo} onChange={(e) => setGrupo(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">TIPO DE PRODUCTO</Label>
                    <Input value={tipoProducto} onChange={(e) => setTipoProducto(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">CLAVE SAT</Label>
                    <Input value={satClave} onChange={(e) => setSatClave(e.target.value)} className="mt-1" />
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
            <Field label="Clase">
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
  laboratorio_nombre: string; // resolved lab name (existing or new); empty = unresolved
  laboratorio_id: string | null; // matched existing id (if any)
  status: "new" | "update" | "unchanged" | "error";
  existing_id?: string | null; // id of matched existing product (for updates)
  diff_fields?: string[]; // list of changed field labels
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
  const [creatingLab, setCreatingLab] = useState(false);
  const [newLabName, setNewLabName] = useState("");
  const [savingLab, setSavingLab] = useState(false);
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

  const createLab = async () => {
    const nombre = newLabName.trim();
    if (!nombre) return toast.error("Escribe un nombre");
    setSavingLab(true);
    try {
      const { data, error } = await supabase
        .from("laboratorios")
        .insert({ nombre })
        .select("id, nombre")
        .single();
      if (error) throw error;
      toast.success("Laboratorio creado");
      await labsQ.refetch();
      setLabId(data.id);
      setNewLabName("");
      setCreatingLab(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingLab(false);
    }
  };

  const [analyzing, setAnalyzing] = useState(false);

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const XLSX = await import("xlsx-js-style");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
      });

      const { data: existing } = await supabase
        .from("productos")
        .select(
          "id, sku, nombre, marca, proveedor, peso_kg, precio_lista, laboratorio_id",
        );
      type ExistingProd = {
        id: string;
        sku: string | null;
        nombre: string | null;
        marca: string | null;
        proveedor: string | null;
        peso_kg: number | null;
        precio_lista: number | null;
        laboratorio_id: string | null;
      };
      const existingList = (existing ?? []) as ExistingProd[];
      const existingBySku = new Map<string, ExistingProd>();
      const existingByName = new Map<string, ExistingProd>();
      for (const p of existingList) {
        if (p.sku) existingBySku.set(p.sku.toLowerCase().trim(), p);
        if (p.nombre) existingByName.set(p.nombre.toLowerCase().trim(), p);
      }

      const diffRow = (
        row: Omit<ImportRow, "status" | "existing_id" | "diff_fields" | "errorMsg">,
      ): { status: ImportRow["status"]; existing_id?: string; diff_fields?: string[] } => {
        const key = row.sku.toLowerCase().trim();
        const nameKey = row.nombre.toLowerCase().trim();
        const match =
          (key && existingBySku.get(key)) ||
          (nameKey && existingByName.get(nameKey)) ||
          null;
        if (!match) return { status: "new" };
        const diff: string[] = [];
        const norm = (v: unknown) =>
          v == null || v === "" ? null : typeof v === "string" ? v.trim() : v;
        if (row.nombre && norm(row.nombre) !== norm(match.nombre)) diff.push("nombre");
        if (row.marca && norm(row.marca) !== norm(match.marca)) diff.push("marca");
        if (row.proveedor && norm(row.proveedor) !== norm(match.proveedor))
          diff.push("proveedor");
        if (
          row.peso_kg != null &&
          Number(row.peso_kg) !== Number(match.peso_kg ?? NaN)
        )
          diff.push("peso");
        if (
          row.precio_lista != null &&
          Number(row.precio_lista) !== Number(match.precio_lista ?? NaN)
        )
          diff.push("precio");
        if (
          row.laboratorio_id &&
          row.laboratorio_id !== (match.laboratorio_id ?? null)
        )
          diff.push("laboratorio");
        return diff.length > 0
          ? { status: "update", existing_id: match.id, diff_fields: diff }
          : { status: "unchanged", existing_id: match.id };
      };

      // Heuristic mapping as a fallback / starting point.
      const heuristicParse = (): ImportRow[] =>
        json.map((r) => {
          const get = (...keys: string[]) => {
            for (const k of keys) {
              for (const real of Object.keys(r)) {
                if (real.toLowerCase().trim() === k.toLowerCase())
                  return String(r[real] ?? "").trim();
              }
            }
            return "";
          };
          const sku = get("clave", "sku", "codigo", "código");
          const nombre = get("nombre", "producto", "descripcion", "descripción", "name");
          const marca = get("marca", "brand");
          const proveedor = get("proveedor", "supplier");
          const peso = get("peso", "peso_kg", "weight_kg", "kg");
          const precio = get("precio", "precio_civa", "precio c/iva", "price", "precio lista");
          const labNombre = get("laboratorio", "lab", "laboratory");
          const base = { sku, nombre, marca, proveedor, laboratorio_nombre: labNombre, laboratorio_id: null as string | null };
          if (!nombre) {
            return {
              ...base,
              peso_kg: null,
              precio_lista: null,
              status: "error" as const,
              errorMsg: "Falta nombre",
            };
          }
          const row = {
            ...base,
            peso_kg: peso ? Number(peso) || null : null,
            precio_lista: precio ? Number(precio) || null : null,
          };
          return { ...row, ...diffRow(row) } as ImportRow;
        });

      // Ask the AI to map columns and infer laboratorio per row.
      setAnalyzing(true);
      const labs = labsQ.data ?? [];
      const sampleRows = json.slice(0, 800); // cap tokens
      const headers = Object.keys(json[0] ?? {});
      const system = `Eres un asistente que normaliza datos de productos farmacéuticos veterinarios desde Excel.
Devuelves SOLO JSON válido, sin markdown ni texto extra.
Tarea: para cada fila del Excel, identifica los campos canónicos y el laboratorio.
Campos canónicos:
- sku (clave/código del producto, string corto o vacío)
- nombre (descripción del producto)
- marca
- proveedor
- peso_kg (número en kg; convierte gramos a kg si aplica; null si no se sabe)
- precio_lista (número, precio de lista en MXN; null si no se sabe)
- laboratorio (nombre del laboratorio; intenta hacer match con la lista existente, si no, sugiere el nombre limpio tal como aparece)
Las columnas del Excel pueden tener cualquier nombre o idioma. Detecta por contenido.
Responde con: {"rows":[{"sku":"","nombre":"","marca":"","proveedor":"","peso_kg":null,"precio_lista":null,"laboratorio":""}, ...]} en el MISMO ORDEN y MISMA CANTIDAD que la entrada.`;
      const userMsg = JSON.stringify({
        laboratorios_existentes: labs.map((l) => l.nombre),
        headers,
        rows: sampleRows,
      });

      let aiRows: Array<{
        sku?: string;
        nombre?: string;
        marca?: string;
        proveedor?: string;
        peso_kg?: number | null;
        precio_lista?: number | null;
        laboratorio?: string;
      }> | null = null;

      try {
        const resp = await aiChatFn({
          data: {
            model: "gpt-4o-mini",
            temperature: 0,
            messages: [
              { role: "system", content: system },
              { role: "user", content: userMsg },
            ],
          },
        });
        const content =
          (resp as { content?: string; choices?: Array<{ message?: { content?: string } }> })
            ?.content ??
          (resp as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]
            ?.message?.content ??
          "";
        const cleaned = String(content)
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```$/i, "")
          .trim();
        const parsedJson = JSON.parse(cleaned);
        aiRows = Array.isArray(parsedJson?.rows) ? parsedJson.rows : null;
      } catch (e) {
        console.warn("AI mapping failed, using heuristic", e);
      }

      const labByNameLower = new Map(labs.map((l) => [l.nombre.toLowerCase(), l]));

      let parsed: ImportRow[];
      if (aiRows && aiRows.length > 0) {
        parsed = aiRows.map((r, i) => {
          const sku = String(r.sku ?? "").trim();
          const nombre = String(r.nombre ?? "").trim();
          const marca = String(r.marca ?? "").trim();
          const proveedor = String(r.proveedor ?? "").trim();
          const labNombre = String(r.laboratorio ?? "").trim();
          const matchedLab = labNombre ? labByNameLower.get(labNombre.toLowerCase()) : undefined;
          const peso_kg =
            r.peso_kg == null || String(r.peso_kg) === "" ? null : Number(r.peso_kg) || null;
          const precio_lista =
            r.precio_lista == null || String(r.precio_lista) === ""
              ? null
              : Number(r.precio_lista) || null;
          if (!nombre) {
            return {
              sku,
              nombre,
              marca,
              proveedor,
              peso_kg: null,
              precio_lista: null,
              laboratorio_nombre: labNombre,
              laboratorio_id: matchedLab?.id ?? null,
              status: "error",
              errorMsg: `Fila ${i + 2}: falta nombre`,
            };
          }
          const baseRow = {
            sku,
            nombre,
            marca,
            proveedor,
            peso_kg,
            precio_lista,
            laboratorio_nombre: labNombre,
            laboratorio_id: matchedLab?.id ?? null,
          };
          return { ...baseRow, ...diffRow(baseRow) } as ImportRow;
        });
      } else {
        parsed = heuristicParse().map((r) => {
          if (r.status === "error") return r;
          const matched = r.laboratorio_nombre
            ? labByNameLower.get(r.laboratorio_nombre.toLowerCase())
            : undefined;
          const withLab = { ...r, laboratorio_id: matched?.id ?? null };
          return { ...withLab, ...diffRow(withLab) } as ImportRow;
        });
      }

      setRows(parsed);
      if (aiRows) toast.success("Excel analizado con IA");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
      setAnalyzing(false);
    }
  };

  const save = async () => {
    const toInsert = rows.filter((r) => r.status === "new");
    const toUpdate = rows.filter((r) => r.status === "update");
    if (toInsert.length === 0 && toUpdate.length === 0)
      return toast.info("No hay cambios por aplicar");

    // Determine lab per row: prefer per-row resolved id; else use new-lab name; else override dropdown.
    const overrideLab = labId || null;
    const missingLab = toInsert.filter(
      (r) => !r.laboratorio_id && !r.laboratorio_nombre.trim() && !overrideLab,
    );
    if (missingLab.length > 0) {
      return toast.error(
        `Hay ${missingLab.length} producto(s) nuevo(s) sin laboratorio. Selecciona un laboratorio por defecto.`,
      );
    }

    setSaving(true);
    try {
      // Create any new labs found by AI (distinct, not matching existing) across both insert+update.
      const newLabNames = Array.from(
        new Set(
          [...toInsert, ...toUpdate]
            .filter((r) => !r.laboratorio_id && r.laboratorio_nombre.trim())
            .map((r) => r.laboratorio_nombre.trim()),
        ),
      );
      const newLabMap = new Map<string, string>(); // nombre lower -> id
      if (newLabNames.length > 0) {
        const { data: created, error: labErr } = await supabase
          .from("laboratorios")
          .insert(newLabNames.map((nombre) => ({ nombre })))
          .select("id, nombre");
        if (labErr) throw labErr;
        for (const l of created ?? []) {
          newLabMap.set((l.nombre as string).toLowerCase(), l.id as string);
        }
        await labsQ.refetch();
      }

      const resolveLab = (r: ImportRow) => {
        const labFromName =
          r.laboratorio_nombre &&
          newLabMap.get(r.laboratorio_nombre.toLowerCase());
        return r.laboratorio_id ?? labFromName ?? overrideLab;
      };

      // INSERT new
      if (toInsert.length > 0) {
        const payload = toInsert.map((r) => ({
          sku: r.sku || null,
          nombre: r.nombre,
          marca: r.marca || null,
          proveedor: r.proveedor || null,
          peso_kg: r.peso_kg,
          precio_lista: r.precio_lista ?? 0,
          laboratorio_id: resolveLab(r),
          activo: true,
        }));
        const { error } = await supabase.from("productos").insert(payload);
        if (error) throw error;
      }

      // UPDATE changed (one row per update to scope to diff fields only)
      let updated = 0;
      for (const r of toUpdate) {
        if (!r.existing_id) continue;
        const fields = new Set(r.diff_fields ?? []);
        const patch: Record<string, unknown> = {};
        if (fields.has("nombre")) patch.nombre = r.nombre;
        if (fields.has("marca")) patch.marca = r.marca || null;
        if (fields.has("proveedor")) patch.proveedor = r.proveedor || null;
        if (fields.has("peso")) patch.peso_kg = r.peso_kg;
        if (fields.has("precio")) patch.precio_lista = r.precio_lista ?? 0;
        if (fields.has("laboratorio")) patch.laboratorio_id = resolveLab(r);
        if (Object.keys(patch).length === 0) continue;
        const { error } = await supabase
          .from("productos")
          .update(patch)
          .eq("id", r.existing_id);
        if (error) throw error;
        updated++;
      }

      toast.success(
        `${toInsert.length} nuevo(s) · ${updated} actualizado(s)${
          newLabNames.length ? ` · ${newLabNames.length} laboratorio(s) creado(s)` : ""
        }`,
      );
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
      update: rows.filter((r) => r.status === "update").length,
      unchanged: rows.filter((r) => r.status === "unchanged").length,
      err: rows.filter((r) => r.status === "error").length,
    };
  }, [rows]);

  const [dragOver, setDragOver] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar productos desde Excel
          </DialogTitle>
          <DialogDescription>
            <Sparkles className="inline h-3.5 w-3.5 text-primary" /> La IA analiza
            tu Excel, detecta columnas automáticamente y asigna el laboratorio por
            fila. Los laboratorios nuevos se crearán al importar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/60 hover:bg-muted/40",
              (parsing || analyzing) && "pointer-events-none opacity-70",
            )}
          >
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
            <div className="flex flex-col items-center gap-2">
              {analyzing ? (
                <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <div className="text-sm font-medium">
                {analyzing
                  ? "Analizando catálogo con IA…"
                  : parsing
                    ? "Leyendo archivo…"
                    : "Arrastra tu Excel del catálogo completo o haz clic para seleccionar"}
              </div>
              <div className="text-xs text-muted-foreground">
                La IA detectará columnas, agregará nuevos productos y actualizará los existentes sin duplicar (.xlsx, .xls)
              </div>
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">
                Laboratorio por defecto (opcional, para filas sin laboratorio)
              </Label>
              <div className="mt-1 flex gap-2">
                <Select value={labId} onValueChange={setLabId}>
                  <SelectTrigger className="flex-1">
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
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Nuevo laboratorio"
                  onClick={() => setCreatingLab((v) => !v)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {creatingLab && (
            <div className="flex items-end gap-2 rounded-md border border-dashed border-border bg-muted/30 p-3">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">
                  Nombre del nuevo laboratorio
                </Label>
                <Input
                  className="mt-1"
                  value={newLabName}
                  onChange={(e) => setNewLabName(e.target.value)}
                  placeholder="Ej. Zoetis"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createLab();
                    }
                  }}
                  autoFocus
                />
              </div>
              <Button onClick={createLab} disabled={savingLab}>
                {savingLab ? "Guardando…" : "Crear"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setCreatingLab(false);
                  setNewLabName("");
                }}
              >
                Cancelar
              </Button>
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600">
                  Nuevos: {counts.new}
                </Badge>
                <Badge variant="outline" className="border-blue-500/40 bg-blue-500/10 text-blue-600">
                  A actualizar: {counts.update}
                </Badge>
                <Badge variant="outline" className="border-muted-foreground/30 bg-muted/30 text-muted-foreground">
                  Sin cambios: {counts.unchanged}
                </Badge>
                <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                  Errores: {counts.err}
                </Badge>
              </div>

              <div className="max-h-[380px] overflow-y-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Estado</TableHead>
                      <TableHead>Clave</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Clase</TableHead>
                      <TableHead>Laboratorio</TableHead>
                      <TableHead>Cambios</TableHead>
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
                          {r.status === "update" && (
                            <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/40">
                              Actualizar
                            </Badge>
                          )}
                          {r.status === "unchanged" && (
                            <Badge variant="outline" className="text-muted-foreground">
                              Sin cambios
                            </Badge>
                          )}
                          {r.status === "error" && (
                            <Badge variant="destructive">{r.errorMsg}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.sku || "—"}</TableCell>
                        <TableCell>{r.nombre || "—"}</TableCell>
                        <TableCell>{r.marca || "—"}</TableCell>
                        <TableCell className="text-xs">
                          {r.laboratorio_nombre ? (
                            r.laboratorio_id ? (
                              <span>{r.laboratorio_nombre}</span>
                            ) : (
                              <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                                <Plus className="mr-1 h-3 w-3" />
                                {r.laboratorio_nombre}
                              </Badge>
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.diff_fields && r.diff_fields.length > 0
                            ? r.diff_fields.join(", ")
                            : "—"}
                        </TableCell>
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
            <Button
              onClick={save}
              disabled={saving || (counts.new === 0 && counts.update === 0)}
            >
              {saving
                ? "Aplicando…"
                : `Aplicar (${counts.new} nuevos · ${counts.update} actualizar)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
