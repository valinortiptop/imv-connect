// @ts-nocheck
// Excel importer for inventory stock.
// Designed for the IMV "Valor de inventario con lote" report which has the columns:
//   - Artículo                       → SKU / clave (productos.sku)
//   - Artículo: Nombre para mostrar  → nombre del producto
//   - Valor de factura               → valor total (informativo)
//   - % de Valor de factura          → informativo
//   - Físico                         → existencia física actual (cantidad)
//   - Números de serie/lote          → lotes en formato "ABC123(qty),DEF456(qty)"
//
// The importer uses AI to map columns (so other layouts also work), matches
// rows against productos.sku, and applies the target stock through the
// `public.ajustar_stock` RPC, which writes the proper inventory movement
// and updates the stock table via trigger.
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
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { aiChatFn } from "@/lib/valinor.functions";

type Status = "update" | "unchanged" | "not_found" | "error";

type ImportRow = {
  sku: string;
  name: string;
  target_stock: number | null;
  current_stock: number | null;
  delta: number | null;
  lotes?: string | null;
  product_id?: string | null;
  status: Status;
  errorMsg?: string;
};

export function InventoryImportDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [almacenId, setAlmacenId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const XLSX = await import("xlsx-js-style");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      // Read raw matrix so we can detect a banner row before headers.
      const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        blankrows: false,
      });
      if (matrix.length < 2) {
        toast.error("El Excel está vacío");
        return;
      }
      // Find the header row: first row that has at least 2 non-empty cells
      // and contains a likely SKU header.
      const stripAcc = (s: string) =>
        String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      let headerIdx = 0;
      for (let i = 0; i < Math.min(matrix.length, 10); i++) {
        const cells = matrix[i].map(stripAcc);
        const hasSku = cells.some((c) =>
          /\b(articulo|sku|clave|codigo|cb)\b/.test(c),
        );
        const hasQty = cells.some((c) =>
          /(fisico|existencia|stock|cantidad|inventario|piezas|bultos|qty)/.test(c),
        );
        if (hasSku && hasQty) {
          headerIdx = i;
          break;
        }
      }
      const headers = matrix[headerIdx].map((h) => String(h ?? "").trim());
      const dataRows = matrix.slice(headerIdx + 1).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
      const json: Record<string, unknown>[] = dataRows.map((r) => {
        const o: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          o[h || `col_${i}`] = r[i];
        });
        return o;
      });
      if (json.length === 0) {
        toast.error("No se encontraron filas con datos");
        return;
      }

      // Pull product catalog (paginated to avoid the 1000 row default).
      type Prod = { id: string; sku: string | null; nombre: string | null };
      const allProds: Prod[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("productos")
          .select("id, sku, nombre")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allProds.push(...(data as Prod[]));
        if (data.length < PAGE) break;
      }
      const byClave = new Map<string, Prod>();
      for (const p of allProds) {
        if (p.sku) byClave.set(String(p.sku).toLowerCase().trim(), p);
      }

      // Current stock per producto (sum from stock table).
      const { data: stockRows } = await supabase
        .from("stock")
        .select("producto_id, cantidad");
      const stockById = new Map<string, number>();
      for (const s of (stockRows ?? []) as any[]) {
        stockById.set(
          s.producto_id,
          (stockById.get(s.producto_id) ?? 0) + Number(s.cantidad ?? 0),
        );
      }

      // Primary warehouse for adjustments.
      const { data: alm } = await supabase
        .from("almacenes")
        .select("id, principal")
        .order("principal", { ascending: false })
        .limit(1);
      const primaryAlm = (alm?.[0] as any)?.id ?? null;
      setAlmacenId(primaryAlm);
      if (!primaryAlm) {
        toast.error("No hay un almacén principal configurado");
        return;
      }

      // Ask the AI to normalize each row.
      setAnalyzing(true);
      const sampleRows = json.slice(0, 1500);
      const system = `Normalizas una hoja de inventario para un distribuidor farmacéutico veterinario en México. Devuelves SOLO JSON válido, sin markdown.
Cada fila tiene:
- sku (clave del producto — obligatorio; columnas típicas: "Artículo", "SKU", "Clave", "Código", "CB")
- name (nombre del producto, opcional; columnas tipo "Artículo: Nombre para mostrar", "Nombre", "Descripción")
- target_stock (existencia física actual como número entero; columnas tipo "Físico", "Existencia", "Stock", "Cantidad", "Inventario", "Piezas", "Bultos"). Si no aparece, null.
- lotes (cadena con lotes y cantidades, opcional; columnas tipo "Números de serie/lote", "Lote", "Lotes"). Pasa el texto tal cual.
Responde {"rows":[{"sku":"...","name":"...","target_stock":123,"lotes":"..."}]} en el MISMO ORDEN y MISMA CANTIDAD que la entrada.`;
      const userMsg = JSON.stringify({ headers, rows: sampleRows });

      let aiRows: any[] | null = null;
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
          (resp as any)?.content ??
          (resp as any)?.choices?.[0]?.message?.content ??
          "";
        const cleaned = String(content)
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```$/i, "")
          .trim();
        const parsedJson = JSON.parse(cleaned);
        aiRows = Array.isArray(parsedJson?.rows) ? parsedJson.rows : null;
      } catch (e) {
        console.warn("AI mapping failed, falling back to heuristics", e);
      }

      const stripAccents = (s: string) =>
        s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const norm = (s: string) => stripAccents(String(s ?? "")).toLowerCase().trim();

      const get = (r: Record<string, unknown>, ...keys: string[]) => {
        const nkeys = keys.map(norm);
        for (const real of Object.keys(r)) {
          const nreal = norm(real);
          for (const k of nkeys) {
            if (nreal === k || nreal.startsWith(k + ":") || nreal.startsWith(k + " ")) {
              return String(r[real] ?? "").trim();
            }
          }
        }
        return "";
      };

      const heuristicRow = (r: Record<string, unknown>) => ({
        sku: get(r, "articulo", "sku", "clave", "codigo", "cb", "cod"),
        name: get(
          r,
          "articulo: nombre para mostrar",
          "nombre",
          "name",
          "producto",
          "descripcion",
        ),
        target_stock_str: get(
          r,
          "fisico",
          "existencia",
          "stock",
          "cantidad",
          "inventario",
          "bultos",
          "piezas",
          "qty",
          "stock_actual",
        ),
        lotes: get(
          r,
          "numeros de serie/lote",
          "lote",
          "lotes",
          "serie",
        ),
      });

      const built: ImportRow[] = json.map((raw, i) => {
        const ai = aiRows?.[i] ?? null;
        const h = heuristicRow(raw);
        const pick = (a: any, b: any) =>
          a != null && String(a).trim() !== "" ? String(a).trim() : String(b ?? "").trim();
        const sku = pick(ai?.sku, h.sku);
        const name = pick(ai?.name, h.name);
        const lotes = pick(ai?.lotes, h.lotes) || null;
        const targetRaw = ai?.target_stock ?? h.target_stock_str;
        const target_stock =
          targetRaw == null || targetRaw === "" || Number.isNaN(Number(targetRaw))
            ? null
            : Math.max(0, Math.round(Number(targetRaw)));

        if (!sku) {
          return {
            sku: "",
            name,
            target_stock,
            current_stock: null,
            delta: null,
            lotes,
            status: "error",
            errorMsg: `Fila ${i + headerIdx + 2}: falta SKU/clave`,
          };
        }
        if (target_stock == null) {
          return {
            sku,
            name,
            target_stock: null,
            current_stock: null,
            delta: null,
            lotes,
            status: "error",
            errorMsg: `Fila ${i + headerIdx + 2}: falta cantidad`,
          };
        }
        const key = sku.toLowerCase().trim();
        const match = byClave.get(key);
        if (!match) {
          return {
            sku,
            name,
            target_stock,
            current_stock: null,
            delta: null,
            lotes,
            status: "not_found",
          };
        }
        const current_stock = stockById.get(match.id) ?? 0;
        const delta = target_stock - current_stock;
        return {
          sku,
          name: name || match.nombre || "",
          target_stock,
          current_stock,
          delta,
          lotes,
          product_id: match.id,
          status: delta === 0 ? "unchanged" : "update",
        };
      });

      setRows(built);
      if (aiRows) toast.success(`Excel analizado con IA — ${built.length} filas`);
      else toast.info(`Excel procesado con heurística — ${built.length} filas`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
      setAnalyzing(false);
    }
  };

  const save = async () => {
    const toUpdate = rows.filter((r) => r.status === "update" && r.product_id);
    if (toUpdate.length === 0) return toast.info("No hay cambios por aplicar");
    if (!almacenId) return toast.error("Almacén principal no disponible");

    setSaving(true);
    let updated = 0;
    try {
      for (const r of toUpdate) {
        const notas = `Importación inventario — SKU ${r.sku}: ${r.current_stock} → ${r.target_stock}${r.lotes ? ` · lotes: ${r.lotes}` : ""}`;
        const { error: rpcErr } = await supabase.rpc("ajustar_stock", {
          _producto: r.product_id!,
          _almacen: almacenId,
          _nueva_cantidad: r.target_stock!,
          _notas: notas,
        });
        if (rpcErr) throw rpcErr;
        updated++;
      }
      toast.success(`${updated} producto(s) actualizado(s)`);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(
    () => ({
      update: rows.filter((r) => r.status === "update").length,
      unchanged: rows.filter((r) => r.status === "unchanged").length,
      notFound: rows.filter((r) => r.status === "not_found").length,
      err: rows.filter((r) => r.status === "error").length,
    }),
    [rows],
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar inventario desde Excel
          </DialogTitle>
          <DialogDescription>
            <Sparkles className="inline h-3.5 w-3.5 text-primary" /> Compatible con
            el reporte <em>Valor de inventario con lote</em> (columnas: Artículo,
            Nombre, Valor de factura, Físico, Lotes). La IA detecta las columnas
            y el ajuste se aplica al almacén principal usando <code>ajustar_stock</code>.
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
                  ? "Analizando inventario con IA…"
                  : parsing
                    ? "Leyendo archivo…"
                    : "Arrastra tu Excel de inventario o haz clic para seleccionar"}
              </div>
              <div className="text-xs text-muted-foreground">
                .xlsx o .xls — la IA detecta SKU/clave, cantidad física y lotes.
              </div>
            </div>
          </div>

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 border-blue-500/30">
                  {counts.update} a actualizar
                </Badge>
                <Badge variant="secondary" className="bg-muted text-muted-foreground">
                  {counts.unchanged} sin cambios
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
              </div>

              <div className="max-h-[40vh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-24">Estado</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Objetivo</TableHead>
                      <TableHead className="text-right">Δ</TableHead>
                      <TableHead>Lotes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 300).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {r.status === "update" && (
                            <Badge className="bg-blue-500/15 text-blue-700 border-blue-500/30">
                              actualizar
                            </Badge>
                          )}
                          {r.status === "unchanged" && (
                            <Badge variant="outline">sin cambios</Badge>
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
                        <TableCell className="max-w-[260px] truncate" title={r.name}>
                          {r.name || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.current_stock ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.target_stock ?? "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums font-medium",
                            r.delta != null && r.delta > 0 && "text-emerald-600",
                            r.delta != null && r.delta < 0 && "text-red-600",
                          )}
                        >
                          {r.delta == null ? "—" : r.delta > 0 ? `+${r.delta}` : r.delta}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground" title={r.lotes ?? undefined}>
                          {r.lotes ?? "—"}
                        </TableCell>
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
          <Button
            onClick={save}
            disabled={saving || counts.update === 0}
          >
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Aplicar ({counts.update})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default InventoryImportDialog;
