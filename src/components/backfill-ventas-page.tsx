import { useState } from "react";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import { backfillNetsuiteSales2026Fn } from "@/lib/backfill-sales.functions";
import { importSalesHistory, parseNetSuiteSalesFile } from "@/lib/sales-history-import";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";

type Line = {
  sku: string;
  description: string | null;
  quantity: number;
  revenue: number;
};

type Invoice = {
  invoice_no: string;
  invoice_date: string;
  rep_name: string | null;
  client_name: string | null;
  lab_name: string | null;
  lines: Line[];
};

type Counters = {
  processed_invoices: number;
  created_pedidos: number;
  skipped_existing: number;
  created_pedido_items: number;
  created_facturas: number;
  created_factura_items: number;
  created_client_stubs: number;
  created_product_stubs: number;
  created_rep_stubs: number;
  errors: string[];
};

const CHUNK_INVOICES = 100;

function toDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 90000) {
    const parsed = (XLSX as any).SSF?.parse_date_code?.(v);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    let y = +dmy[3];
    if (y < 100) y += 2000;
    return `${y}-${String(+dmy[2]).padStart(2, "0")}-${String(+dmy[1]).padStart(2, "0")}`;
  }
  return null;
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function parseInvoicesFromFile(file: File): Promise<Invoice[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: false });
  const invMap = new Map<string, Invoice>();
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
    let headerIdx = -1;
    for (let i = 0; i < Math.min(raw.length, 25); i++) {
      const row = (raw[i] || []).map((c) => String(c ?? "").trim());
      if (row.join("|").toLowerCase().includes("cliente/proyecto")) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) continue;
    const header = (raw[headerIdx] as any[]).map((c) => String(c ?? "").trim());
    const idx = (label: string) =>
      header.findIndex((h) => h.toLowerCase().includes(label));
    const iRep = idx("representante");
    const iLab = idx("clase");
    const iCli = idx("cliente");
    const iInv = idx("documento");
    const iDate = idx("fecha");
    const iSku = idx("artículo") >= 0 ? idx("artículo") : idx("articulo");
    const iDesc = header.findIndex((h) =>
      h.toLowerCase().includes("descripción") || h.toLowerCase().includes("descripcion"),
    );
    const iQty = idx("cantidad");
    const iRev = idx("ingresos");

    for (let r = headerIdx + 1; r < raw.length; r++) {
      const row = raw[r] as any[];
      if (!row) continue;
      const invNo = String(row[iInv] ?? "").trim();
      if (!invNo) continue;
      const date = toDate(row[iDate]);
      if (!date) continue;
      const sku = String(row[iSku] ?? "").trim();
      if (!sku) continue;
      const cli = String(row[iCli] ?? "").trim();
      const rep = String(row[iRep] ?? "").trim();
      const lab = String(row[iLab] ?? "").trim();
      const desc = String(row[iDesc] ?? "").trim() || null;
      const qty = num(row[iQty]);
      const rev = num(row[iRev]);

      let inv = invMap.get(invNo);
      if (!inv) {
        inv = {
          invoice_no: invNo,
          invoice_date: date,
          rep_name: rep || null,
          client_name: cli || null,
          lab_name: lab || null,
          lines: [],
        };
        invMap.set(invNo, inv);
      }
      inv.lines.push({ sku, description: desc, quantity: qty, revenue: rev });
    }
  }
  return Array.from(invMap.values());
}

export default function BackfillVentasPage() {
  const backfill = useServerFn(backfillNetsuiteSales2026Fn);
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>("");
  const [totals, setTotals] = useState<Counters>({
    processed_invoices: 0,
    created_pedidos: 0,
    skipped_existing: 0,
    created_pedido_items: 0,
    created_facturas: 0,
    created_factura_items: 0,
    created_client_stubs: 0,
    created_product_stubs: 0,
    created_rep_stubs: 0,
    errors: [],
  });

  const run = async () => {
    if (!file) return;
    setRunning(true);
    setProgress(0);
    setStatus("Cargando empresa…");
    setTotals({
      processed_invoices: 0,
      created_pedidos: 0,
      skipped_existing: 0,
      created_pedido_items: 0,
      created_facturas: 0,
      created_factura_items: 0,
      created_client_stubs: 0,
      created_product_stubs: 0,
      created_rep_stubs: 0,
      errors: [],
    });
    try {
      const { data: emp } = await supabase
        .from("empresas")
        .select("id")
        .limit(1)
        .single();
      const empresaId = emp?.id as string | undefined;
      if (!empresaId) throw new Error("No hay empresa configurada");

      setStatus("Leyendo archivo…");
      const invoices = await parseInvoicesFromFile(file);
      if (invoices.length === 0) throw new Error("No se encontraron facturas en el archivo");
      const totalInv = invoices.length;
      setStatus(`Procesando ${totalInv.toLocaleString()} facturas…`);

      // Kick off sales_history import in parallel (does its own chunking)
      const shPromise = (async () => {
        try {
          const rows = await parseNetSuiteSalesFile(file);
          return await importSalesHistory(empresaId, rows);
        } catch (e) {
          console.error("sales_history import failed", e);
          return null;
        }
      })();

      const acc: Counters = { ...totals, errors: [] };
      for (let i = 0; i < invoices.length; i += CHUNK_INVOICES) {
        const batch = invoices.slice(i, i + CHUNK_INVOICES);
        try {
          const res = (await backfill({
            data: { empresaId, invoices: batch },
          })) as Counters;
          acc.processed_invoices += res.processed_invoices;
          acc.created_pedidos += res.created_pedidos;
          acc.skipped_existing += res.skipped_existing;
          acc.created_pedido_items += res.created_pedido_items;
          acc.created_facturas += res.created_facturas;
          acc.created_factura_items += res.created_factura_items;
          acc.created_client_stubs += res.created_client_stubs;
          acc.created_product_stubs += res.created_product_stubs;
          acc.created_rep_stubs += res.created_rep_stubs;
          if (res.errors?.length) acc.errors.push(...res.errors.slice(0, 5));
        } catch (e: any) {
          acc.errors.push(`chunk ${i}: ${e?.message ?? String(e)}`);
        }
        const done = Math.min(i + CHUNK_INVOICES, totalInv);
        setProgress(Math.round((done / totalInv) * 100));
        setStatus(
          `Procesadas ${done.toLocaleString()} / ${totalInv.toLocaleString()} facturas`,
        );
        setTotals({ ...acc });
      }

      const sh = await shPromise;
      if (sh) {
        toast.success(
          `Backfill listo · sales_history: ${sh.inserted} filas nuevas`,
        );
      } else {
        toast.success("Backfill listo");
      }
      setStatus("Completado");
    } catch (e: any) {
      toast.error(e?.message ?? "Error en el backfill");
      setStatus("Error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-5 w-5 text-primary" />
            Backfill ventas 2026 (NetSuite)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sube el reporte <strong>“IMV VENTAS DESGLOSADAS”</strong> de NetSuite
            (formato .xls XML). Cada factura se convierte en un pedido{" "}
            <em>entregado</em> + factura <em>pagada</em> con sus renglones. Se
            crean stubs automáticos para clientes, productos y representantes que
            no existan aún. El proceso es idempotente: correrlo dos veces no
            duplica nada.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".xls,.xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={running}
              className="text-sm"
            />
            <Button onClick={run} disabled={!file || running}>
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando…
                </>
              ) : (
                "Iniciar backfill"
              )}
            </Button>
          </div>

          {(running || progress > 0) && (
            <div className="space-y-2">
              <Progress value={progress} />
              <div className="text-xs text-muted-foreground">{status}</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
            <Stat label="Facturas procesadas" value={totals.processed_invoices} />
            <Stat label="Pedidos creados" value={totals.created_pedidos} />
            <Stat label="Facturas creadas" value={totals.created_facturas} />
            <Stat label="Renglones pedido" value={totals.created_pedido_items} />
            <Stat label="Renglones factura" value={totals.created_factura_items} />
            <Stat label="Ya existían (skip)" value={totals.skipped_existing} />
            <Stat label="Clientes nuevos" value={totals.created_client_stubs} />
            <Stat label="Productos nuevos" value={totals.created_product_stubs} />
            <Stat label="Reps nuevos" value={totals.created_rep_stubs} />
          </div>

          {totals.errors.length > 0 && (
            <details className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
              <summary className="cursor-pointer font-semibold text-destructive">
                {totals.errors.length} avisos / errores
              </summary>
              <ul className="mt-2 space-y-1">
                {totals.errors.slice(0, 50).map((e, i) => (
                  <li key={i} className="font-mono">
                    {e}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}
