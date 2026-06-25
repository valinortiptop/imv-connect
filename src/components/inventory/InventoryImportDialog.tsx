// @ts-nocheck
// Excel importer for inventory stock — AI maps columns (SKU + cantidad),
// matches against existing products and applies the delta via the
// products.stock_adjustment column (same path used by StockAdjustmentDialog).
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
  product_id?: string | null;
  current_adjustment?: number | null;
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
  const inputRef = useRef<HTMLInputElement>(null);

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
      if (json.length === 0) {
        toast.error("El Excel está vacío");
        return;
      }

      // Pull product catalog (clave + current adj + current actual via view).
      const { data: prods } = await supabase
        .from("productos")
        .select("id, clave, name, stock_adjustment");
      const { data: vstock } = await supabase
        .from("v_products_with_stock")
        .select("id, clave, stock_actual");

      type Prod = { id: string; clave: string | null; name: string | null; stock_adjustment: number | null };
      const byClave = new Map<string, Prod>();
      for (const p of (prods ?? []) as Prod[]) {
        if (p.clave) byClave.set(String(p.clave).toLowerCase().trim(), p);
      }
      const stockByClave = new Map<string, number>();
      for (const r of (vstock ?? []) as any[]) {
        if (r.clave) stockByClave.set(String(r.clave).toLowerCase().trim(), Number(r.stock_actual ?? 0));
      }

      // Ask the AI to normalize each row.
      setAnalyzing(true);
      const headers = Object.keys(json[0] ?? {});
      const sampleRows = json.slice(0, 1500);
      const system = `Eres un asistente que normaliza una hoja de inventario para un distribuidor farmacéutico veterinario en México.
Devuelves SOLO JSON válido, sin markdown.
Para cada fila identifica:
- sku (clave / código del producto — obligatorio; suele venir como "SKU", "Clave", "Código", "CB")
- name (nombre / descripción del producto, opcional)
- target_stock (cantidad objetivo en bodega como número entero. Acepta columnas tipo "Existencia", "Stock", "Cantidad", "Inventario", "Bultos", "Piezas"). Si no aparece, null.
Responde con: {"rows":[{"sku":"...","name":"...","target_stock":123}, ...]} en el MISMO ORDEN y MISMA CANTIDAD que la entrada.`;
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

      const get = (r: Record<string, unknown>, ...keys: string[]) => {
        for (const k of keys) {
          for (const real of Object.keys(r)) {
            if (real.toLowerCase().trim() === k.toLowerCase())
              return String(r[real] ?? "").trim();
          }
        }
        return "";
      };

      const heuristicRow = (r: Record<string, unknown>) => ({
        sku: get(r, "sku", "clave", "codigo", "código", "cb", "cod"),
        name: get(r, "nombre", "name", "producto", "descripcion", "descripción"),
        target_stock_str: get(
          r,
          "existencia",
          "stock",
          "cantidad",
          "inventario",
          "bultos",
          "piezas",
          "qty",
          "stock_actual",
        ),
      });

      const built: ImportRow[] = json.map((raw, i) => {
        const ai = aiRows?.[i] ?? null;
        const h = heuristicRow(raw);
        const pick = (a: any, b: any) =>
          a != null && String(a).trim() !== "" ? String(a).trim() : String(b ?? "").trim();
        const sku = pick(ai?.sku, h.sku);
        const name = pick(ai?.name, h.name);
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
            status: "error",
            errorMsg: `Fila ${i + 2}: falta SKU/clave`,
          };
        }
        if (target_stock == null) {
          return {
            sku,
            name,
            target_stock: null,
            current_stock: null,
            delta: null,
            status: "error",
            errorMsg: `Fila ${i + 2}: falta cantidad`,
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
            status: "not_found",
          };
        }
        const current_stock = stockByClave.get(key) ?? 0;
        const delta = target_stock - current_stock;
        return {
          sku,
          name: name || match.name || "",
          target_stock,
          current_stock,
          delta,
          product_id: match.id,
          current_adjustment: match.stock_adjustment ?? 0,
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

    setSaving(true);
    let updated = 0;
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? null;
      for (const r of toUpdate) {
        const newAdj = (r.current_adjustment ?? 0) + (r.delta ?? 0);
        const { error: updErr } = await supabase
          .from("productos")
          .update({ stock_adjustment: newAdj } as any)
          .eq("id", r.product_id!);
        if (updErr) throw updErr;
        // Log the movement for traceability.
        await supabase.from("stock_adjustments").insert({
          product_id: r.product_id!,
          original_quantity: r.delta ?? 0,
          remaining_quantity: r.delta ?? 0,
          reason: "Importación Excel inventario",
          notes: `SKU ${r.sku}: ${r.current_stock} → ${r.target_stock}`,
          status: "applied",
          created_by: userId,
        } as any);
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar inventario desde Excel
          </DialogTitle>
          <DialogDescription>
            <Sparkles className="inline h-3.5 w-3.5 text-primary" /> La IA detecta
            las columnas (SKU + cantidad) y compara contra el stock actual. Se
            ajustará <code>stock_adjustment</code> para igualar el inventario importado.
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
                .xlsx o .xls — la IA detecta SKU/clave y la columna de cantidad.
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
                        <TableCell className="max-w-[280px] truncate" title={r.name}>
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
