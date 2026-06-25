// @ts-nocheck
// Excel importer for price lists.
// Designed for the IMV "Catálogo completo de productos" report whose
// relevant columns are:
//   - Nombre                                       → SKU (productos.sku)
//   - Nombre para mostrar                          → nombre del producto
//   - Clase                                        → marca / clase (productos.marca)
//   - Línea, Grupo, Tipo de producto               → taxonomía
//   - Precio base                                  → productos.precio_lista (Lista Base)
//   - 2, 3, 4, 5, 6                                → Listas L2 a L6 (price_list_items)
//   - SAT Clave Producto Servicio                  → productos.sat_clave
//
// On apply:
//   1. Ensures `Lista 2…Lista 6` exist in `price_lists` (manual lists).
//   2. Updates each matched producto's base price + taxonomy.
//   3. Upserts each per-list price into `price_list_items` skipping
//      empty / NaN / 0 cells.
import React, { useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileSpreadsheet,
  Upload,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

type Status = "ready" | "not_found" | "error";

const PRICE_LIST_KEYS = ["2", "3", "4", "5", "6"] as const;
type PriceListKey = (typeof PRICE_LIST_KEYS)[number];
const LIST_LABEL: Record<PriceListKey, string> = {
  "2": "Lista 2",
  "3": "Lista 3",
  "4": "Lista 4",
  "5": "Lista 5",
  "6": "Lista 6",
};

type ImportRow = {
  sku: string;
  name: string;
  clase: string | null;
  linea: string | null;
  grupo: string | null;
  tipo_producto: string | null;
  sat_clave: string | null;
  precio_base: number | null;
  prices: Record<PriceListKey, number | null>;
  product_id?: string | null;
  status: Status;
  errorMsg?: string;
};

const numOrNull = (v: any): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
};

export function PriceListsImportDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const XLSX = await import("xlsx-js-style");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        blankrows: false,
      });
      if (matrix.length < 2) {
        toast.error("El Excel está vacío");
        return;
      }

      // Detect header row (must contain SKU header and "Precio base" or similar)
      let headerIdx = 0;
      for (let i = 0; i < Math.min(matrix.length, 10); i++) {
        const cells = matrix[i].map((c) => String(c ?? "").toLowerCase().trim());
        const hasSku = cells.some((c) => /\b(nombre|art[ií]culo|sku|clave|c[oó]digo)\b/.test(c));
        const hasPrice = cells.some((c) => /precio\s*base|precio/.test(c));
        if (hasSku && hasPrice) {
          headerIdx = i;
          break;
        }
      }
      const headers = matrix[headerIdx].map((h) => String(h ?? "").trim());
      const dataRows = matrix
        .slice(headerIdx + 1)
        .filter((r) => r.some((c) => String(c ?? "").trim() !== ""));

      // Map header → column index, robust to "2" / "2.00" / "Lista 2" variants
      const idxOf = (preds: ((h: string) => boolean)[]): number => {
        for (const pred of preds) {
          const i = headers.findIndex((h) => pred(h));
          if (i !== -1) return i;
        }
        return -1;
      };
      const norm = (h: string) => h.toLowerCase().trim();
      const exact = (target: string) => (h: string) => norm(h) === target.toLowerCase();
      const includes = (sub: string) => (h: string) => norm(h).includes(sub.toLowerCase());

      const cols = {
        sku: idxOf([exact("nombre"), exact("artículo"), exact("articulo"), exact("sku"), exact("clave")]),
        name: idxOf([
          includes("nombre para mostrar"),
          exact("nombre del producto"),
          exact("descripción"),
          exact("descripcion"),
        ]),
        clase: idxOf([exact("clase"), exact("marca")]),
        linea: idxOf([exact("línea"), exact("linea")]),
        grupo: idxOf([exact("grupo")]),
        tipo: idxOf([exact("tipo de producto"), exact("tipo")]),
        sat: idxOf([includes("sat"), includes("clave producto")]),
        base: idxOf([exact("precio base"), exact("base"), exact("precio")]),
      };

      const listCols: Record<PriceListKey, number> = { "2": -1, "3": -1, "4": -1, "5": -1, "6": -1 };
      for (const k of PRICE_LIST_KEYS) {
        const found = headers.findIndex((h) => {
          const n = norm(h).replace(/\.0+$/, "");
          return n === k || n === `lista ${k}` || n === `l${k}` || Number(n) === Number(k);
        });
        listCols[k] = found;
      }

      if (cols.sku === -1 || cols.base === -1) {
        toast.error("No se detectó la columna de SKU/Nombre o Precio base");
        return;
      }

      // Pull product catalog
      type Prod = { id: string; sku: string | null };
      const allProds: Prod[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("productos")
          .select("id, sku")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allProds.push(...(data as Prod[]));
        if (data.length < PAGE) break;
      }
      const byClave = new Map<string, string>();
      for (const p of allProds) {
        if (p.sku) byClave.set(String(p.sku).toLowerCase().trim(), p.id);
      }

      const built: ImportRow[] = dataRows.map((r, i) => {
        const sku = String(r[cols.sku] ?? "").trim();
        const name = cols.name >= 0 ? String(r[cols.name] ?? "").trim() : "";
        const clase = cols.clase >= 0 ? String(r[cols.clase] ?? "").trim() || null : null;
        const linea = cols.linea >= 0 ? String(r[cols.linea] ?? "").trim() || null : null;
        const grupo = cols.grupo >= 0 ? String(r[cols.grupo] ?? "").trim() || null : null;
        const tipo_producto = cols.tipo >= 0 ? String(r[cols.tipo] ?? "").trim() || null : null;
        const sat_clave = cols.sat >= 0 ? String(r[cols.sat] ?? "").trim() || null : null;
        const precio_base = numOrNull(r[cols.base]);
        const prices: Record<PriceListKey, number | null> = { "2": null, "3": null, "4": null, "5": null, "6": null };
        for (const k of PRICE_LIST_KEYS) {
          if (listCols[k] >= 0) prices[k] = numOrNull(r[listCols[k]]);
        }

        if (!sku) {
          return {
            sku: "",
            name,
            clase,
            linea,
            grupo,
            tipo_producto,
            sat_clave,
            precio_base,
            prices,
            status: "error",
            errorMsg: `Fila ${i + headerIdx + 2}: falta SKU`,
          };
        }
        const product_id = byClave.get(sku.toLowerCase().trim()) ?? null;
        return {
          sku,
          name,
          clase,
          linea,
          grupo,
          tipo_producto,
          sat_clave,
          precio_base,
          prices,
          product_id,
          status: product_id ? "ready" : "not_found",
        };
      });

      setRows(built);
      toast.success(`Excel procesado — ${built.length} filas`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const counts = useMemo(() => {
    const c = {
      ready: rows.filter((r) => r.status === "ready").length,
      notFound: rows.filter((r) => r.status === "not_found").length,
      err: rows.filter((r) => r.status === "error").length,
      priceCount: { "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 } as Record<PriceListKey, number>,
      baseCount: 0,
    };
    for (const r of rows) {
      if (r.status !== "ready") continue;
      if (r.precio_base != null) c.baseCount++;
      for (const k of PRICE_LIST_KEYS) if (r.prices[k] != null) c.priceCount[k]++;
    }
    return c;
  }, [rows]);

  const save = async () => {
    const toApply = rows.filter((r) => r.status === "ready" && r.product_id);
    if (toApply.length === 0) return toast.info("No hay filas listas para aplicar");

    setSaving(true);
    try {
      // 1. Ensure price_lists exist (Lista 2..6, manual lists)
      const { data: existingLists, error: listsErr } = await supabase
        .from("price_lists")
        .select("id, name");
      if (listsErr) throw listsErr;
      const listIdByName = new Map<string, string>();
      for (const l of (existingLists ?? []) as any[]) listIdByName.set(l.name, l.id);
      const missing = PRICE_LIST_KEYS.filter((k) => !listIdByName.has(LIST_LABEL[k]));
      if (missing.length > 0) {
        const inserts = missing.map((k) => ({
          name: LIST_LABEL[k],
          markup_pct: null,
          active: true,
          description: `Lista ${k} — importada desde catálogo Excel`,
        }));
        const { data: inserted, error: insErr } = await supabase
          .from("price_lists")
          .insert(inserts)
          .select("id, name");
        if (insErr) throw insErr;
        for (const l of (inserted ?? []) as any[]) listIdByName.set(l.name, l.id);
      }

      // 2. Update productos in batches (taxonomy + base price)
      let prodUpdated = 0;
      for (const r of toApply) {
        const patch: Record<string, any> = { updated_at: new Date().toISOString() };
        if (r.precio_base != null) patch.precio_lista = r.precio_base;
        if (r.clase) patch.marca = r.clase;
        if (r.linea) patch.linea = r.linea;
        if (r.grupo) patch.grupo = r.grupo;
        if (r.tipo_producto) patch.tipo_producto = r.tipo_producto;
        if (r.sat_clave) patch.sat_clave = r.sat_clave;
        if (Object.keys(patch).length > 1) {
          const { error } = await supabase.from("productos").update(patch).eq("id", r.product_id!);
          if (error) throw error;
          prodUpdated++;
        }
      }

      // 3. Upsert price_list_items per list
      let priceItems = 0;
      for (const k of PRICE_LIST_KEYS) {
        const listId = listIdByName.get(LIST_LABEL[k])!;
        const items = toApply
          .filter((r) => r.prices[k] != null)
          .map((r) => ({
            price_list_id: listId,
            product_id: r.product_id!,
            price_with_iva: r.prices[k]!,
            manual_override: true,
          }));
        if (items.length === 0) continue;
        // Upsert in chunks of 500
        for (let i = 0; i < items.length; i += 500) {
          const chunk = items.slice(i, i + 500);
          const { error } = await supabase
            .from("price_list_items")
            .upsert(chunk, { onConflict: "price_list_id,product_id" });
          if (error) throw error;
          priceItems += chunk.length;
        }
      }

      toast.success(
        `${prodUpdated} productos · ${priceItems} precios en ${PRICE_LIST_KEYS.length} listas`,
      );
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar listas de precios desde Excel
          </DialogTitle>
          <DialogDescription>
            Compatible con el <em>Catálogo completo de productos</em>: usa la columna{" "}
            <code>Nombre</code> como SKU, <code>Precio base</code> como Lista Base, y las
            columnas <code>2, 3, 4, 5, 6</code> como Listas 2 a 6. También actualiza{" "}
            Clase, Línea, Grupo, Tipo y Clave SAT.
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
              parsing && "pointer-events-none opacity-70",
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
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-sm font-medium">
                {parsing
                  ? "Leyendo archivo…"
                  : "Arrastra tu Excel de precios o haz clic para seleccionar"}
              </div>
              <div className="text-xs text-muted-foreground">.xlsx o .xls</div>
            </div>
          </div>

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                  {counts.ready} productos coincidentes
                </Badge>
                {counts.notFound > 0 && (
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
                    {counts.notFound} SKU no encontrados
                  </Badge>
                )}
                {counts.err > 0 && (
                  <Badge variant="secondary" className="bg-red-500/10 text-red-700 border-red-500/30">
                    {counts.err} con error
                  </Badge>
                )}
                <span className="text-muted-foreground">·</span>
                <Badge variant="outline">Base: {counts.baseCount}</Badge>
                {PRICE_LIST_KEYS.map((k) => (
                  <Badge key={k} variant="outline">
                    L{k}: {counts.priceCount[k]}
                  </Badge>
                ))}
              </div>

              <div className="max-h-[50vh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-24">Estado</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Clase</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      {PRICE_LIST_KEYS.map((k) => (
                        <TableHead key={k} className="text-right">L{k}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 300).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {r.status === "ready" && (
                            <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
                              ok
                            </Badge>
                          )}
                          {r.status === "not_found" && (
                            <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">
                              no encontrado
                            </Badge>
                          )}
                          {r.status === "error" && (
                            <Badge className="bg-red-500/15 text-red-700 border-red-500/30">
                              <AlertCircle className="mr-1 h-3 w-3" /> error
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.sku || "—"}</TableCell>
                        <TableCell className="max-w-[220px] truncate" title={r.name}>
                          {r.name || "—"}
                        </TableCell>
                        <TableCell className="text-xs">{r.clase ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.precio_base != null ? `$${r.precio_base.toFixed(2)}` : "—"}
                        </TableCell>
                        {PRICE_LIST_KEYS.map((k) => (
                          <TableCell key={k} className="text-right tabular-nums">
                            {r.prices[k] != null ? `$${r.prices[k]!.toFixed(2)}` : "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rows.length > 300 && (
                  <div className="p-2 text-center text-xs text-muted-foreground">
                    Mostrando 300 de {rows.length} filas — todas se procesarán al guardar.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || counts.ready === 0}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Aplicar ({counts.ready})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PriceListsImportDialog;
