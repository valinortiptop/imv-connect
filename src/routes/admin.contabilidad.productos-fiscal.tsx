import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { ArrowUpDown, Download, Receipt, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Product360Drawer } from "@/components/catalog/Product360Drawer";
import { useCanEditFiscal, useCodigosFiscales, fiscalUpdatePayload } from "@/hooks/use-fiscal";
import { applyCodigo, describeIva, describeRet, matchCodigo, normalizeConfig, type TaxConfig } from "@/lib/product-tax";

export const Route = createFileRoute("/admin/contabilidad/productos-fiscal")({
  head: () => ({
    meta: [
      { title: "Impuestos por producto — Contabilidad IMV" },
      { name: "description", content: "Código fiscal, IVA, IEPS y retenciones de cada producto, con filtros para contabilidad." },
      { property: "og:title", content: "Impuestos por producto — Contabilidad IMV" },
      { property: "og:description", content: "Configuración fiscal por producto para el contador." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductosFiscalPage,
});

type Row = TaxConfig & {
  id: string; sku: string | null; nombre: string; laboratorio: string; activo: boolean;
  codigo_fiscal_id: string | null; sat_prod: string | null; sat_unit: string | null;
};
type SortKey = "sku" | "nombre" | "laboratorio" | "codigo" | "iva" | "ieps" | "ret_iva" | "ret_isr" | "sat_prod" | "sat_unit";

async function fetchAll(): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("productos")
      .select("id, sku, nombre, activo, sat_clave, sat_product_key, sat_unit_key, codigo_fiscal_id, iva_modo, iva_pct, objeto_impuesto, ieps_pct, ret_iva_modo, ret_iva_pct, ret_isr_modo, ret_isr_pct, marca, laboratorios(nombre)" as any)
      .order("nombre")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of (data ?? []) as any[]) {
      out.push({ ...normalizeConfig(r), id: r.id, sku: r.sku, nombre: r.nombre, activo: r.activo !== false,
        laboratorio: r.laboratorios?.nombre ?? r.marca ?? "", codigo_fiscal_id: r.codigo_fiscal_id,
        sat_prod: r.sat_product_key ?? r.sat_clave ?? null, sat_unit: r.sat_unit_key ?? null });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

const PAGE = 100;

function ProductosFiscalPage() {
  const qc = useQueryClient();
  const { data: codigos = [] } = useCodigosFiscales();
  const { data: canEdit = false } = useCanEditFiscal();
  const q = useQuery({ queryKey: ["productos-fiscal"], queryFn: fetchAll });
  const [search, setSearch] = useState("");
  const [fCodigo, setFCodigo] = useState("all");
  const [fIva, setFIva] = useState("all");
  const [fIeps, setFIeps] = useState("all");
  const [fRet, setFRet] = useState("all");
  const [fSat, setFSat] = useState("all");
  const [fActivo, setFActivo] = useState("activos");
  const [fLab, setFLab] = useState("all");
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "nombre", dir: 1 });
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState("");
  const [open360, setOpen360] = useState<string | null>(null);

  const codeOf = (r: Row) => {
    const byId = codigos.find((c) => c.id === r.codigo_fiscal_id);
    return byId ?? matchCodigo(r, codigos);
  };
  const rows = q.data ?? [];
  const labs = useMemo(() => [...new Set(rows.map((r) => r.laboratorio).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const res = rows.filter((r) => {
      if (fActivo === "activos" && !r.activo) return false;
      if (fActivo === "inactivos" && r.activo) return false;
      if (fLab !== "all" && r.laboratorio !== fLab) return false;
      const c = codeOf(r);
      if (fCodigo === "none" && r.codigo_fiscal_id) return false;
      if (fCodigo === "custom" && c) return false;
      if (!["all", "none", "custom"].includes(fCodigo) && c?.id !== fCodigo) return false;
      if (fIva !== "all" && describeIva(r) !== fIva) return false;
      if (fIeps === "si" && r.ieps_pct <= 0) return false;
      if (fIeps === "no" && r.ieps_pct > 0) return false;
      if (fRet === "iva" && r.ret_iva_modo === "sin") return false;
      if (fRet === "isr" && r.ret_isr_modo === "sin") return false;
      if (fRet === "ninguna" && (r.ret_iva_modo !== "sin" || r.ret_isr_modo !== "sin")) return false;
      if (fSat === "sin_prod" && r.sat_prod) return false;
      if (fSat === "sin_unit" && r.sat_unit) return false;
      if (s && !`${r.sku ?? ""} ${r.nombre} ${r.laboratorio}`.toLowerCase().includes(s)) return false;
      return true;
    });
    const val = (r: Row): string | number => {
      switch (sort.k) {
        case "codigo": return codeOf(r)?.clave ?? "~";
        case "iva": return r.iva_modo === "producto" && r.objeto_impuesto ? r.iva_pct : -1;
        case "ieps": return r.ieps_pct;
        case "ret_iva": return r.ret_iva_pct;
        case "ret_isr": return r.ret_isr_pct;
        case "sku": return r.sku ?? "";
        case "sat_prod": return r.sat_prod ?? "";
        case "sat_unit": return r.sat_unit ?? "";
        default: return (r as any)[sort.k] ?? "";
      }
    };
    return res.sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es")) * sort.dir;
    });
  }, [rows, codigos, search, fCodigo, fIva, fIeps, fRet, fSat, fActivo, fLab, sort]);

  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    let sinCodigo = 0, sinSat = 0;
    for (const r of rows) {
      if (!r.activo) continue;
      const c = codeOf(r);
      if (!r.codigo_fiscal_id) sinCodigo++;
      if (!r.sat_prod || !r.sat_unit) sinSat++;
      const k = c?.clave ?? "Personalizado";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return { m, sinCodigo, sinSat };
  }, [rows, codigos]);

  const bulkMut = useMutation({
    mutationFn: async () => {
      const c = codigos.find((x) => x.id === bulk);
      if (!c) throw new Error("Elige un código");
      const ids = [...sel];
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await supabase.from("productos").update(fiscalUpdatePayload(applyCodigo(c), c.id) as any).in("id", ids.slice(i, i + 200));
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: (n) => { toast.success(`${n} productos actualizados`); setSel(new Set()); qc.invalidateQueries({ queryKey: ["productos-fiscal"] }); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo actualizar"),
  });

  const exportXlsx = () => {
    const data = filtered.map((r) => ({
      SKU: r.sku ?? "", Producto: r.nombre, Laboratorio: r.laboratorio, "Código fiscal": codeOf(r)?.clave ?? "Personalizado",
      IVA: describeIva(r), "IEPS %": r.ieps_pct, "Ret. IVA": describeRet(r.ret_iva_modo, r.ret_iva_pct),
      "Ret. ISR": describeRet(r.ret_isr_modo, r.ret_isr_pct), "Clave SAT producto": r.sat_prod ?? "", "Clave SAT unidad": r.sat_unit ?? "",
      Activo: r.activo ? "Sí" : "No",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Impuestos");
    XLSX.writeFile(wb, "impuestos_por_producto.xlsx");
  };

  const Th = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={`px-2 py-2 font-medium ${right ? "text-right" : "text-left"}`}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-2" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {children}<ArrowUpDown className="size-3 opacity-50" />
      </button>
    </th>
  );
  const F = (p: { value: string; onChange: (v: string) => void; label: string; opts: [string, string][] }) => (
    <Select value={p.value} onValueChange={(v) => { p.onChange(v); setPage(0); }}>
      <SelectTrigger className="h-9 w-full sm:w-44" aria-label={p.label}><SelectValue /></SelectTrigger>
      <SelectContent>{p.opts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="h-6 w-6 text-primary" /> Impuestos por producto</h1>
          <p className="text-sm text-muted-foreground">Código fiscal, IVA, IEPS y retenciones de cada producto. Haz clic en un producto para editarlo.</p>
        </div>
        <Button variant="outline" onClick={exportXlsx} disabled={!filtered.length}><Download className="size-4" /> Exportar Excel</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[...counts.m.entries()].sort().map(([k, v]) => (
          <Badge key={k} variant="secondary" className="font-normal">{k}: <span className="ml-1 font-semibold">{v}</span></Badge>
        ))}
        <Badge variant="destructive" className="font-normal">Sin código: {counts.sinCodigo}</Badge>
        <Badge variant="outline" className="font-normal">Sin clave SAT completa: {counts.sinSat}</Badge>
      </div>

      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <div className="relative sm:w-64">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input aria-label="Buscar producto" className="pl-8 h-9" placeholder="Buscar SKU, nombre…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <F label="Código fiscal" value={fCodigo} onChange={setFCodigo} opts={[["all", "Todos los códigos"], ["none", "Sin código asignado"], ["custom", "Personalizado"], ...codigos.map((c) => [c.id, c.clave] as [string, string])]} />
        <F label="IVA" value={fIva} onChange={setFIva} opts={[["all", "IVA: todos"], ["16%", "IVA 16%"], ["0%", "IVA 0%"], ["Exento", "Exento"], ["No objeto", "No objeto"], ["Por tipo", "Por tipo"]]} />
        <F label="IEPS" value={fIeps} onChange={setFIeps} opts={[["all", "IEPS: todos"], ["si", "Con IEPS"], ["no", "Sin IEPS"]]} />
        <F label="Retenciones" value={fRet} onChange={setFRet} opts={[["all", "Retenciones: todas"], ["iva", "Con ret. IVA"], ["isr", "Con ret. ISR"], ["ninguna", "Sin retenciones"]]} />
        <F label="Claves SAT" value={fSat} onChange={setFSat} opts={[["all", "Claves SAT: todas"], ["sin_prod", "Sin clave producto"], ["sin_unit", "Sin clave unidad"]]} />
        <F label="Estado" value={fActivo} onChange={setFActivo} opts={[["activos", "Activos"], ["inactivos", "Inactivos"], ["todos", "Todos"]]} />
        <F label="Laboratorio" value={fLab} onChange={setFLab} opts={[["all", "Todos los laboratorios"], ...labs.map((l) => [l, l] as [string, string])]} />
      </div>

      {canEdit && sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 text-sm">
          <span className="font-medium">{sel.size} seleccionados</span>
          <Select value={bulk} onValueChange={setBulk}>
            <SelectTrigger className="h-9 w-56" aria-label="Asignar código"><SelectValue placeholder="Asignar código fiscal…" /></SelectTrigger>
            <SelectContent>{codigos.filter((c) => c.activo).map((c) => <SelectItem key={c.id} value={c.id}>{c.clave} — {c.nombre}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" disabled={!bulk || bulkMut.isPending} onClick={() => bulkMut.mutate()}>{bulkMut.isPending ? "Aplicando…" : "Aplicar"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Limpiar</Button>
        </div>
      )}

      {q.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
      ) : q.isError ? (
        <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
          No se pudieron cargar los productos. <Button variant="link" onClick={() => q.refetch()}>Reintentar</Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">No hay productos con estos filtros.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  {canEdit && (
                    <th className="px-2 py-2 w-8">
                      <Checkbox aria-label="Seleccionar página" checked={pageRows.every((r) => sel.has(r.id))}
                        onCheckedChange={(v) => setSel((s) => { const n = new Set(s); pageRows.forEach((r) => (v ? n.add(r.id) : n.delete(r.id))); return n; })} />
                    </th>
                  )}
                  <Th k="sku">SKU</Th><Th k="nombre">Producto</Th><Th k="laboratorio">Laboratorio</Th><Th k="codigo">Código</Th>
                  <Th k="iva" right>IVA</Th><Th k="ieps" right>IEPS</Th><Th k="ret_iva" right>Ret. IVA</Th><Th k="ret_isr" right>Ret. ISR</Th>
                  <Th k="sat_prod">SAT prod.</Th><Th k="sat_unit">SAT unidad</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageRows.map((r) => {
                  const c = codeOf(r);
                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      {canEdit && (
                        <td className="px-2 py-1.5">
                          <Checkbox aria-label={`Seleccionar ${r.nombre}`} checked={sel.has(r.id)}
                            onCheckedChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(r.id) : n.delete(r.id); return n; })} />
                        </td>
                      )}
                      <td className="px-2 py-1.5 font-mono text-xs">{r.sku ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        <button type="button" className="text-left hover:underline focus-visible:outline-2" onClick={() => setOpen360(r.id)}>{r.nombre}</button>
                        {!r.activo && <Badge variant="outline" className="ml-2 text-[10px]">Inactivo</Badge>}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">{r.laboratorio || "—"}</td>
                      <td className="px-2 py-1.5">{c ? <Badge variant="secondary">{c.clave}</Badge> : <Badge variant="outline">{r.codigo_fiscal_id ? "Personalizado" : "Sin código"}</Badge>}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{describeIva(r)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.ieps_pct > 0 ? `${r.ieps_pct}%` : "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{describeRet(r.ret_iva_modo, r.ret_iva_pct)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{describeRet(r.ret_isr_modo, r.ret_isr_pct)}</td>
                      <td className="px-2 py-1.5 font-mono text-xs">{r.sat_prod ?? <span className="text-muted-foreground">Sin clave</span>}</td>
                      <td className="px-2 py-1.5 font-mono text-xs">{r.sat_unit ?? <span className="text-muted-foreground">Sin clave</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{filtered.length.toLocaleString("es-MX")} de {rows.length.toLocaleString("es-MX")} productos</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span>{page + 1} / {pages}</span>
              <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
            </div>
          </div>
        </>
      )}

      <Product360Drawer productId={open360} open={!!open360} onOpenChange={(o) => { if (!o) { setOpen360(null); qc.invalidateQueries({ queryKey: ["productos-fiscal"] }); } }} />
    </section>
  );
}
