// @ts-nocheck
// Excel/CSV importer for proveedores (laboratorios).
// Heuristic column mapping. Detects new vs update by normalized nombre.
import React, { useRef, useState } from "react";
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
import { FileSpreadsheet, Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

type Status = "new" | "update" | "unchanged" | "error";

type ImportRow = {
  nombre: string;
  logo_url: string;
  orden: number;
  activo: boolean;
  status: Status;
  existing_id?: string | null;
  errorMsg?: string;
};

const normKey = (s: string | null | undefined) =>
  (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function SuppliersImportDialog({
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
      const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (json.length === 0) {
        toast.error("El archivo está vacío");
        return;
      }

      // Load existing laboratorios for match detection
      const { data: existing, error } = await supabase
        .from("laboratorios")
        .select("id, nombre");
      if (error) throw error;
      const byName = new Map<string, { id: string; nombre: string }>();
      for (const l of existing ?? []) {
        const k = normKey(l.nombre);
        if (k) byName.set(k, l);
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

      const built: ImportRow[] = json.map((raw, i) => {
        const nombre = get(raw, "nombre", "proveedor", "laboratorio", "supplier", "name");
        const logo_url = get(raw, "logo", "logo_url", "logo url", "imagen", "image_url");
        const ordenStr = get(raw, "orden", "order", "sort", "prioridad");
        const activoStr = get(raw, "activo", "active", "estatus", "status");
        const orden = ordenStr && !Number.isNaN(Number(ordenStr)) ? Math.round(Number(ordenStr)) : 0;
        const activo = activoStr === ""
          ? true
          : !/^(false|0|no|inactivo|inactive)$/i.test(activoStr.trim());

        if (!nombre) {
          return {
            nombre: "",
            logo_url,
            orden,
            activo,
            status: "error" as Status,
            errorMsg: `Fila ${i + 2}: falta nombre`,
          };
        }
        const match = byName.get(normKey(nombre));
        if (!match) return { nombre, logo_url, orden, activo, status: "new" as Status };
        return {
          nombre,
          logo_url,
          orden,
          activo,
          status: "update" as Status,
          existing_id: match.id,
        };
      });

      setRows(built);
      toast.success(`Archivo procesado — ${built.length} filas`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const runImport = async () => {
    const toInsert = rows.filter((r) => r.status === "new");
    const toUpdate = rows.filter((r) => r.status === "update" && r.existing_id);
    if (toInsert.length + toUpdate.length === 0) {
      toast.info("Nada para importar");
      return;
    }
    setSaving(true);
    try {
      let inserted = 0;
      let updated = 0;
      if (toInsert.length > 0) {
        const { error } = await supabase.from("laboratorios").insert(
          toInsert.map((r) => ({
            nombre: r.nombre,
            logo_url: r.logo_url || null,
            orden: r.orden ?? 0,
            activo: r.activo,
          })),
        );
        if (error) throw error;
        inserted = toInsert.length;
      }
      for (const r of toUpdate) {
        const { error } = await supabase
          .from("laboratorios")
          .update({
            nombre: r.nombre,
            logo_url: r.logo_url || null,
            orden: r.orden ?? 0,
            activo: r.activo,
          })
          .eq("id", r.existing_id!);
        if (error) throw error;
        updated++;
      }
      toast.success(`Importado: ${inserted} nuevos, ${updated} actualizados`);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (s: Status) => {
    if (s === "new") return <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">Nuevo</Badge>;
    if (s === "update") return <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/15">Actualizar</Badge>;
    if (s === "unchanged") return <Badge variant="outline">Sin cambio</Badge>;
    return <Badge variant="destructive">Error</Badge>;
  };

  const counts = {
    new: rows.filter((r) => r.status === "new").length,
    update: rows.filter((r) => r.status === "update").length,
    error: rows.filter((r) => r.status === "error").length,
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar proveedores</DialogTitle>
          <DialogDescription>
            Sube un Excel/CSV con proveedores (laboratorios). Columnas reconocidas:
            <span className="font-mono text-xs"> nombre, logo_url, orden, activo</span>.
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-10 text-center cursor-pointer transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60",
            )}
          >
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
            <div className="text-sm">
              <span className="font-medium">Arrastra el archivo</span> o haz clic para seleccionar
            </div>
            <div className="text-xs text-muted-foreground">.xlsx, .xls, .csv</div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {parsing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Procesando…
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>{counts.new} nuevos</span>
              <span>·</span>
              <span>{counts.update} a actualizar</span>
              {counts.error > 0 && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertCircle className="h-4 w-4" /> {counts.error} con error
                  </span>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => setRows([])}
              >
                Cargar otro archivo
              </Button>
            </div>
            <div className="flex-1 overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-24">Estado</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="w-20">Orden</TableHead>
                    <TableHead className="w-20">Activo</TableHead>
                    <TableHead>Logo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="font-medium">
                        {r.nombre || <span className="text-destructive text-xs">{r.errorMsg}</span>}
                      </TableCell>
                      <TableCell>{r.orden}</TableCell>
                      <TableCell>{r.activo ? "Sí" : "No"}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                        {r.logo_url || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={runImport}
            disabled={saving || rows.length === 0 || counts.new + counts.update === 0}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Importar {counts.new + counts.update > 0 && `(${counts.new + counts.update})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
