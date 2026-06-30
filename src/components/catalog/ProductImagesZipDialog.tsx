/**
 * Bulk-import product images from a ZIP file (drag & drop or file picker).
 * Reads the ZIP client-side with JSZip, matches each filename (sans
 * extension) against the product SKU, uploads to the `productos` bucket
 * and updates `productos.imagen_url`. Handles very large archives (1GB+)
 * by streaming entries one at a time with bounded concurrency — never
 * holds the whole archive decompressed in memory.
 */
import { useCallback, useRef, useState } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, FileArchive, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];
const CONCURRENCY = 4;

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}
function baseOf(path: string) {
  const file = path.split("/").pop() ?? path;
  const i = file.lastIndexOf(".");
  return (i === -1 ? file : file.slice(0, i)).trim();
}
function contentType(ext: string) {
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "bmp") return "image/bmp";
  return "application/octet-stream";
}

export function ProductImagesZipDialog({ open, onOpenChange }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [updated, setUpdated] = useState(0);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ file: string; reason: string }[]>([]);
  const [successes, setSuccesses] = useState<{ file: string; sku: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const reset = () => {
    setProcessed(0);
    setUpdated(0);
    setUnmatched([]);
    setErrors([]);
    setSuccesses([]);
    setTotal(0);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      reset();
    }
  }, []);

  async function run() {
    if (!file) return;
    setRunning(true);
    reset();
    const localUnmatched: string[] = [];
    const localErrors: { file: string; reason: string }[] = [];
    const localSuccesses: { file: string; sku: string }[] = [];
    let localUpdated = 0;
    let localProcessed = 0;

    try {
      const zip = await JSZip.loadAsync(file);
      const entries: JSZip.JSZipObject[] = [];
      zip.forEach((_, entry) => {
        if (entry.dir) return;
        const ext = extOf(entry.name);
        if (!IMAGE_EXTS.includes(ext)) return;
        entries.push(entry);
      });
      setTotal(entries.length);

      // Preload SKU -> id map
      const skuMap = new Map<string, string>();
      let from = 0;
      const page = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("productos")
          .select("id, sku")
          .range(from, from + page - 1);
        if (error) throw error;
        if (!data?.length) break;
        for (const row of data) {
          if (row.sku) skuMap.set(String(row.sku).trim().toLowerCase(), row.id);
        }
        if (data.length < page) break;
        from += page;
      }

      let cursor = 0;
      const worker = async () => {
        while (cursor < entries.length) {
          const idx = cursor++;
          const entry = entries[idx];
          const filename = entry.name.split("/").pop() ?? entry.name;
          try {
            const base = baseOf(entry.name).toLowerCase();
            const productId = skuMap.get(base);
            if (!productId) {
              localUnmatched.push(filename);
            } else {
              const ext = extOf(entry.name);
              const blob = await entry.async("blob");
              const path = `${productId}/main.${ext}`;
              const { error: upErr } = await supabase.storage
                .from("productos")
                .upload(path, blob, {
                  upsert: true,
                  contentType: contentType(ext),
                });
              if (upErr) throw upErr;
              const publicUrl = supabase.storage
                .from("productos")
                .getPublicUrl(path).data.publicUrl;
              const { error: updErr } = await supabase
                .from("productos")
                .update({ imagen_url: publicUrl })
                .eq("id", productId);
              if (updErr) throw updErr;
              localUpdated++;
            }
          } catch (e) {
            localErrors.push({
              file: filename,
              reason: (e as Error).message ?? "error",
            });
          } finally {
            localProcessed++;
            if (localProcessed % 5 === 0 || localProcessed === entries.length) {
              setProcessed(localProcessed);
              setUpdated(localUpdated);
              setUnmatched([...localUnmatched]);
              setErrors([...localErrors]);
            }
          }
        }
      };
      await Promise.all(
        Array.from({ length: CONCURRENCY }, () => worker()),
      );
      setProcessed(localProcessed);
      setUpdated(localUpdated);
      setUnmatched(localUnmatched);
      setErrors(localErrors);
      toast.success(
        `Importadas ${localUpdated} de ${entries.length} imágenes`,
      );
      qc.invalidateQueries({ queryKey: ["productos-catalogo"] });
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  function downloadCsv() {
    const rows = [
      "archivo,motivo",
      ...unmatched.map((f) => `"${f}","sin match (SKU no encontrado)"`),
      ...errors.map(
        (e) => `"${e.file}","${e.reason.replace(/"/g, "'")}"`,
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "imagenes-no-importadas.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !running && onOpenChange(v)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5" /> Importar imágenes desde ZIP
          </DialogTitle>
          <DialogDescription>
            Sube un ZIP con las imágenes. El nombre de cada archivo (sin
            extensión) se hace match contra el SKU del producto. Soporta
            archivos grandes (1GB+).
          </DialogDescription>
        </DialogHeader>

        <div
          onClick={() => !running && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 hover:border-primary/50"
          }`}
        >
          <UploadCloud className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-2 text-sm">
            {file ? (
              <span className="font-medium">
                {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
              </span>
            ) : (
              <>Arrastra el ZIP aquí o haz clic para seleccionar</>
            )}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFile(f);
                reset();
              }
            }}
          />
        </div>

        {(running || processed > 0) && (
          <div className="space-y-2">
            <Progress value={pct} />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Procesadas: {processed} / {total}</div>
              <div>Actualizadas: {updated}</div>
              <div>Sin match: {unmatched.length}</div>
              <div>Errores: {errors.length}</div>
            </div>
          </div>
        )}

        <div className="flex justify-between gap-2">
          {(unmatched.length > 0 || errors.length > 0) && !running && (
            <Button variant="outline" size="sm" onClick={downloadCsv}>
              Descargar CSV
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={running}
            >
              Cerrar
            </Button>
            <Button onClick={run} disabled={running || !file}>
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Iniciar importación"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
