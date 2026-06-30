/**
 * Dialog that drives the OneDrive image bulk-import server fn. Loops
 * through pages of the shared folder (server returns nextLink) so the
 * UI shows live progress instead of blocking for minutes on big
 * folders.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Cloud } from "lucide-react";
import { toast } from "sonner";
import { importProductImagesFromOneDrive } from "@/lib/product-image-import.functions";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const DEFAULT_URL =
  "https://1drv.ms/f/c/60a573aa914531e7/IgDQ61gnsGOpTpC80x0-rtvVASog4Iityg7j8uMMuVsD-po?e=4ixjnZ";

export function ProductImagesOneDriveDialog({ open, onOpenChange }: Props) {
  const [shareUrl, setShareUrl] = useState(DEFAULT_URL);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, updated: 0 });
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ file: string; reason: string }[]>([]);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const importFn = useServerFn(importProductImagesFromOneDrive);
  const qc = useQueryClient();

  async function run() {
    setRunning(true);
    setProgress({ processed: 0, updated: 0 });
    setUnmatched([]);
    setErrors([]);
    let nextLink: string | null | undefined = undefined;
    let totalProcessed = 0;
    let totalUpdated = 0;
    try {
      do {
        const res: {
          processed: number;
          updated: number;
          unmatched: string[];
          errors: { file: string; reason: string }[];
          nextLink: string | null;
        } = await importFn({
          data: { shareUrl, nextLink: nextLink ?? undefined },
        });
        totalProcessed += res.processed;
        totalUpdated += res.updated;
        setProgress({ processed: totalProcessed, updated: totalUpdated });
        setUnmatched((prev) => [...prev, ...res.unmatched]);
        setErrors((prev) => [...prev, ...res.errors]);
        nextLink = res.nextLink;
      } while (nextLink);
      toast.success(`Importadas ${totalUpdated} de ${totalProcessed} imágenes`);
      qc.invalidateQueries({ queryKey: ["productos-catalogo"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  function downloadCsv() {
    const rows = [
      "archivo,motivo",
      ...unmatched.map((f) => `"${f}","sin match"`),
      ...errors.map((e) => `"${e.file}","${e.reason.replace(/"/g, "'")}"`),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "imagenes-no-importadas.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" /> Importar imágenes desde OneDrive
          </DialogTitle>
          <DialogDescription>
            La carpeta debe estar configurada como "Cualquiera con el enlace puede ver".
            El nombre de archivo (sin extensión) se hace match contra el SKU del producto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>URL de OneDrive</Label>
          <Input
            value={shareUrl}
            onChange={(e) => setShareUrl(e.target.value)}
            disabled={running}
          />
        </div>

        {(progress.processed > 0 || running) && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            <div>Procesadas: {progress.processed}</div>
            <div>Actualizadas: {progress.updated}</div>
            <div>Sin match: {unmatched.length}</div>
            <div>Errores: {errors.length}</div>
          </div>
        )}

        <div className="flex justify-between gap-2">
          {(unmatched.length > 0 || errors.length > 0) && !running && (
            <Button variant="outline" size="sm" onClick={downloadCsv}>
              Descargar CSV de no importadas
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
              Cerrar
            </Button>
            <Button onClick={run} disabled={running || !shareUrl}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : "Iniciar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
