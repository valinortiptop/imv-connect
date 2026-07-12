// @ts-nocheck
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, Trash2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import {
  parseNetSuiteSalesFile,
  importSalesHistory,
  listSalesHistoryBatches,
  deleteSalesHistoryBatch,
  type SalesHistoryRow,
  type ImportSummary,
} from "@/lib/sales-history-import";
import { fmtDateShort } from "@/lib/date-utils";

type Props = { empresaId: string; empresaNombre: string };

export function SalesHistoryImportDialog({ empresaId, empresaNombre }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<SalesHistoryRow[] | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const { data: batches, refetch: refetchBatches } = useQuery({
    queryKey: ["sales_history_batches", empresaId],
    queryFn: () => listSalesHistoryBatches(empresaId),
    enabled: open,
  });

  async function handleFile(f: File) {
    setFile(f);
    setPreview(null);
    setSummary(null);
    setParsing(true);
    try {
      const rows = await parseNetSuiteSalesFile(f);
      if (!rows.length) {
        toast.error("No se detectaron filas de venta en el archivo");
        setPreview([]);
        return;
      }
      setPreview(rows);
      toast.success(`Se detectaron ${rows.length.toLocaleString()} líneas de venta`);
    } catch (err: any) {
      toast.error(`Error al leer archivo: ${err.message ?? err}`);
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    if (!preview?.length) return;
    setImporting(true);
    try {
      const res = await importSalesHistory(empresaId, preview);
      setSummary(res);
      if (res.errors.length) {
        toast.warning(`Importación con avisos (${res.errors.length})`);
      } else {
        toast.success(`Se importaron ${res.inserted.toLocaleString()} líneas de venta`);
      }
      qc.invalidateQueries({ queryKey: ["ventas_unified"] });
      qc.invalidateQueries({ queryKey: ["ventas"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["pnl"] });
      refetchBatches();
    } catch (err: any) {
      toast.error(`Error al importar: ${err.message ?? err}`);
    } finally {
      setImporting(false);
    }
  }

  async function handleDeleteBatch(batchId: string) {
    if (!confirm("¿Eliminar todas las líneas de este lote?")) return;
    try {
      await deleteSalesHistoryBatch(batchId);
      toast.success("Lote eliminado");
      refetchBatches();
      qc.invalidateQueries({ queryKey: ["ventas_unified"] });
    } catch (err: any) {
      toast.error(err.message ?? String(err));
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4 mr-2" /> Importar ventas (NetSuite)
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Historial de ventas
              <Badge variant="secondary" className="ml-2 font-normal">
                {empresaNombre}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
              <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                Sube el archivo NetSuite "Ventas desglosadas" (.xls o .xlsx)
              </p>
              <input
                id="sales-import-file"
                type="file"
                accept=".xls,.xlsx,.xml,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => document.getElementById("sales-import-file")?.click()}
                disabled={parsing}
              >
                {parsing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analizando…
                  </>
                ) : (
                  "Seleccionar archivo"
                )}
              </Button>
              {file && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              )}
            </div>

            {preview && preview.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-muted/40 px-3 py-2 flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Vista previa · {preview.length.toLocaleString()} líneas
                  </span>
                  <Button size="sm" onClick={handleImport} disabled={importing}>
                    {importing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando…
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" /> Importar {preview.length.toLocaleString()} líneas
                      </>
                    )}
                  </Button>
                </div>
                <div className="overflow-x-auto max-h-60">
                  <table className="text-xs w-full">
                    <thead className="bg-muted/20">
                      <tr>
                        <th className="text-left px-2 py-1">Fecha</th>
                        <th className="text-left px-2 py-1">Factura</th>
                        <th className="text-left px-2 py-1">Cliente</th>
                        <th className="text-left px-2 py-1">Lab</th>
                        <th className="text-left px-2 py-1">SKU</th>
                        <th className="text-right px-2 py-1">Cant.</th>
                        <th className="text-right px-2 py-1">Ingreso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 20).map((r, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="px-2 py-1">{fmtDateShort(r.invoice_date)}</td>
                          <td className="px-2 py-1">{r.invoice_no}</td>
                          <td className="px-2 py-1 truncate max-w-[16ch]">{r.client_name_raw}</td>
                          <td className="px-2 py-1">{r.lab_name_raw}</td>
                          <td className="px-2 py-1">{r.sku}</td>
                          <td className="px-2 py-1 text-right">{r.quantity}</td>
                          <td className="px-2 py-1 text-right">${r.revenue.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {summary && (
              <div className="rounded-lg border border-border p-3 text-sm space-y-1">
                <div className="font-medium">Resumen de importación</div>
                <div>
                  Filas analizadas: <b>{summary.parsed.toLocaleString()}</b>
                </div>
                <div>
                  Insertadas / actualizadas: <b>{summary.inserted.toLocaleString()}</b>
                </div>
                {summary.duplicated > 0 && (
                  <div>Sin cambios (ya existían): <b>{summary.duplicated.toLocaleString()}</b></div>
                )}
                {summary.errors.length > 0 && (
                  <div className="text-destructive text-xs pt-1">
                    {summary.errors.slice(0, 3).map((e, i) => (
                      <div key={i}>· {e}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {batches && batches.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-muted/40 px-3 py-2 text-sm font-medium">
                  Lotes importados
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <table className="text-xs w-full">
                    <thead className="bg-muted/20">
                      <tr>
                        <th className="text-left px-2 py-1">Fecha</th>
                        <th className="text-left px-2 py-1">Fuente</th>
                        <th className="text-right px-2 py-1">Filas</th>
                        <th className="text-right px-2 py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map((b) => (
                        <tr key={b.batch_id} className="border-t border-border/50">
                          <td className="px-2 py-1">{new Date(b.last).toLocaleString()}</td>
                          <td className="px-2 py-1">{b.source}</td>
                          <td className="px-2 py-1 text-right">{b.rows.toLocaleString()}</td>
                          <td className="px-2 py-1 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteBatch(b.batch_id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
