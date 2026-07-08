import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  stampInvoiceFn,
  cancelInvoiceFn,
  downloadInvoiceFn,
  sendInvoiceEmailFn,
} from "@/lib/facturapi.functions";
import { downloadLocalInvoicePdf, downloadLocalInvoiceXml } from "@/lib/local-invoice-downloads";

export const Route = createFileRoute("/admin/facturas/$id")({
  component: FacturaDetalle,
});

type Item = {
  id: string;
  nombre_snapshot: string;
  sku_snapshot: string | null;
  unidad_snapshot: string;
  cantidad: number;
  precio_unitario: number;
  iva_pct: number;
  importe: number;
};

type Pago = {
  id: string;
  fecha: string;
  monto: number;
  metodo: "efectivo" | "transferencia" | "cheque" | "tarjeta" | "otro";
  referencia: string | null;
  notas: string | null;
};

type Estado = "borrador" | "emitida" | "parcial" | "pagada" | "cancelada";

type Factura = {
  id: string;
  folio: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  subtotal: number;
  iva: number;
  total: number;
  pagado: number;
  saldo: number;
  estado: Estado;
  notas: string | null;
  pedido_id: string | null;
  facturapi_id: string | null;
  uuid_fiscal: string | null;
  serie: string | null;
  pdf_url: string | null;
  xml_url: string | null;
  cfdi_status: string | null;
  cliente: { id: string; razon_social: string; nombre_comercial: string | null; rfc: string | null; email: string | null } | null;
  representante: { nombre: string } | null;
  factura_items: Item[];
  pagos: Pago[];
};

const METODOS: Pago["metodo"][] = ["efectivo", "transferencia", "cheque", "tarjeta", "otro"];

function FacturaDetalle() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [pagoMonto, setPagoMonto] = useState("");
  const [pagoMetodo, setPagoMetodo] = useState<Pago["metodo"]>("transferencia");
  const [pagoRef, setPagoRef] = useState("");
  const [pagoFecha, setPagoFecha] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading, error } = useQuery({
    queryKey: ["factura", id],
    queryFn: async () => {
      const { data: factura, error } = await supabase
        .from("facturas")
        .select(
          "id, folio, fecha_emision, fecha_vencimiento, subtotal, iva, total, pagado, saldo, estado, notas, pedido_id, facturapi_id, uuid_fiscal, serie, pdf_url, xml_url, cfdi_status, cliente_id, representante_id",
        )
        .eq("id", id)
        .single();
      if (error) throw error;

      const [clienteRes, representanteRes, itemsRes, pagosRes] = await Promise.all([
        supabase
          .from("clientes")
          .select("id, razon_social, nombre_comercial, rfc, email")
          .eq("id", (factura as any).cliente_id)
          .maybeSingle(),
        (factura as any).representante_id
          ? supabase
              .from("representantes")
              .select("nombre")
              .eq("id", (factura as any).representante_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("factura_items")
          .select("id, nombre_snapshot, sku_snapshot, unidad_snapshot, cantidad, precio_unitario, iva_pct, importe")
          .eq("factura_id", id),
        supabase
          .from("pagos")
          .select("id, fecha, monto, metodo, referencia, notas")
          .eq("factura_id", id),
      ]);

      if (clienteRes.error) throw clienteRes.error;
      if (representanteRes.error) throw representanteRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (pagosRes.error) throw pagosRes.error;

      return {
        ...(factura as any),
        cliente: clienteRes.data,
        representante: representanteRes.data,
        factura_items: itemsRes.data ?? [],
        pagos: pagosRes.data ?? [],
      } as Factura;
    },
  });

  const addPago = useMutation({
    mutationFn: async () => {
      const monto = Number(pagoMonto);
      if (!Number.isFinite(monto) || monto <= 0) throw new Error("Monto inválido");
      const { error } = await supabase.from("pagos").insert({
        factura_id: id,
        monto,
        metodo: pagoMetodo,
        referencia: pagoRef || null,
        fecha: pagoFecha,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pago registrado");
      setPagoMonto(""); setPagoRef("");
      qc.invalidateQueries({ queryKey: ["factura", id] });
      qc.invalidateQueries({ queryKey: ["facturas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delPago = useMutation({
    mutationFn: async (pagoId: string) => {
      const { error } = await supabase.from("pagos").delete().eq("id", pagoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pago eliminado");
      qc.invalidateQueries({ queryKey: ["factura", id] });
      qc.invalidateQueries({ queryKey: ["facturas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelarFactura = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("facturas")
        .update({ estado: "cancelada" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Factura cancelada");
      qc.invalidateQueries({ queryKey: ["factura", id] });
      qc.invalidateQueries({ queryKey: ["facturas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stampFn = useServerFn(stampInvoiceFn);
  const cancelCfdiFn = useServerFn(cancelInvoiceFn);
  const downloadFn = useServerFn(downloadInvoiceFn);
  const emailFn = useServerFn(sendInvoiceEmailFn);

  const timbrar = useMutation({
    mutationFn: () => stampFn({ data: { facturaId: id } }),
    onSuccess: () => {
      toast.success("CFDI timbrado");
      qc.invalidateQueries({ queryKey: ["factura", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelarCfdi = useMutation({
    mutationFn: (motivo: "01" | "02" | "03" | "04") =>
      cancelCfdiFn({ data: { facturaId: id, motivo } }),
    onSuccess: () => {
      toast.success("CFDI cancelado ante SAT");
      qc.invalidateQueries({ queryKey: ["factura", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const descargar = async (format: "pdf" | "xml" | "zip") => {
    try {
      const res = await downloadFn({ data: { facturaId: id, format } });
      const blob = new Blob(
        [Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0))],
        { type: res.contentType },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      try {
        if (format === "pdf") await downloadLocalInvoicePdf(id);
        else if (format === "xml") await downloadLocalInvoiceXml(id);
        else throw e;
        toast.success("Documento interno descargado");
      } catch (fallbackError) {
        toast.error((fallbackError as Error).message || (e as Error).message);
      }
    }
  };

  const enviarCorreo = useMutation({
    mutationFn: (email?: string) => emailFn({ data: { facturaId: id, email } }),
    onSuccess: () => toast.success("Correo enviado"),
    onError: (e: Error) => toast.error(e.message),
  });


  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (error) {
    return (
      <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
        {(error as Error).message}
      </p>
    );
  }
  if (!data) return null;

  const saldo = Number(data.saldo);
  const vencida = saldo > 0 && data.estado !== "cancelada" && new Date(data.fecha_vencimiento) < new Date();

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between">
        <Link to="/admin/facturas" className="text-xs text-primary hover:underline">← Facturas</Link>
        {data.estado !== "cancelada" && (
          <Link
            to="/admin/devoluciones/new"
            search={{ factura: data.id }}
            className="text-xs text-primary hover:underline"
          >
            + Nueva devolución
          </Link>
        )}
      </div>
      <div>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold font-mono">{data.folio}</h1>
          <span className={`rounded px-2 py-0.5 text-xs ${
            data.estado === "pagada" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : data.estado === "parcial" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : data.estado === "cancelada" ? "bg-destructive/10 text-destructive"
            : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
          }`}>{data.estado}</span>
          {vencida && (
            <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
              vencida
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-md border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Conceptos</h2>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 text-left">Concepto</th>
                  <th className="py-2 text-right">Cant.</th>
                  <th className="py-2 text-right">P. Unit.</th>
                  <th className="py-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {data.factura_items.map((it) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="py-2">
                      <div className="font-medium">{it.nombre_snapshot}</div>
                      <div className="text-xs text-muted-foreground">
                        {it.sku_snapshot ?? "—"} · {it.unidad_snapshot}
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums">{Number(it.cantidad)}</td>
                    <td className="py-2 text-right tabular-nums">${Number(it.precio_unitario).toFixed(2)}</td>
                    <td className="py-2 text-right tabular-nums">${Number(it.importe).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-sm">
                <tr className="border-t border-border">
                  <td colSpan={3} className="py-2 text-right text-muted-foreground">Subtotal</td>
                  <td className="py-2 text-right tabular-nums">${Number(data.subtotal).toFixed(2)}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="py-1 text-right text-muted-foreground">IVA</td>
                  <td className="py-1 text-right tabular-nums">${Number(data.iva).toFixed(2)}</td>
                </tr>
                <tr className="border-t border-border">
                  <td colSpan={3} className="py-2 text-right font-semibold">Total</td>
                  <td className="py-2 text-right font-bold tabular-nums">${Number(data.total).toFixed(2)}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="py-1 text-right text-muted-foreground">Pagado</td>
                  <td className="py-1 text-right tabular-nums">${Number(data.pagado).toFixed(2)}</td>
                </tr>
                <tr className="border-t border-border">
                  <td colSpan={3} className="py-2 text-right font-semibold text-primary">Saldo</td>
                  <td className="py-2 text-right font-bold tabular-nums text-primary">${saldo.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="rounded-md border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Pagos</h2>

            {data.estado !== "cancelada" && data.estado !== "pagada" && (
              <div className="mb-4 grid gap-2 sm:grid-cols-5">
                <input
                  type="number" step="0.01" min="0"
                  value={pagoMonto} onChange={(e) => setPagoMonto(e.target.value)}
                  placeholder="Monto" className="input"
                />
                <select
                  value={pagoMetodo}
                  onChange={(e) => setPagoMetodo(e.target.value as Pago["metodo"])}
                  className="input"
                >
                  {METODOS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <input
                  value={pagoRef} onChange={(e) => setPagoRef(e.target.value)}
                  placeholder="Referencia" className="input"
                />
                <input
                  type="date" value={pagoFecha}
                  onChange={(e) => setPagoFecha(e.target.value)} className="input"
                />
                <button
                  onClick={() => addPago.mutate()}
                  disabled={addPago.isPending || !pagoMonto}
                  className="btn-primary text-sm"
                >
                  {addPago.isPending ? "…" : "Registrar"}
                </button>
              </div>
            )}

            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 text-left">Fecha</th>
                  <th className="py-2 text-left">Método</th>
                  <th className="py-2 text-left">Referencia</th>
                  <th className="py-2 text-right">Monto</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.pagos
                  .slice()
                  .sort((a, b) => b.fecha.localeCompare(a.fecha))
                  .map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-2">{new Date(p.fecha).toLocaleDateString("es-MX")}</td>
                      <td className="py-2 text-xs">{p.metodo}</td>
                      <td className="py-2 text-xs text-muted-foreground">{p.referencia ?? "—"}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">${Number(p.monto).toFixed(2)}</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => { if (confirm("¿Eliminar pago?")) delPago.mutate(p.id); }}
                          className="text-xs text-destructive hover:underline"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                {data.pagos.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-sm text-muted-foreground">Sin pagos registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Cliente</h2>
            <p className="font-medium">{data.cliente?.nombre_comercial ?? data.cliente?.razon_social ?? "—"}</p>
            {data.cliente?.rfc && <p className="text-xs font-mono text-muted-foreground">{data.cliente.rfc}</p>}
            {data.cliente?.email && <p className="text-xs text-muted-foreground">{data.cliente.email}</p>}
          </div>

          <div className="rounded-md border border-border bg-card p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Emisión</span>
              <span>{new Date(data.fecha_emision).toLocaleDateString("es-MX")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vencimiento</span>
              <span className={vencida ? "text-destructive font-semibold" : ""}>
                {new Date(data.fecha_vencimiento).toLocaleDateString("es-MX")}
              </span>
            </div>
            {data.representante && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Representante</span>
                <span>{data.representante.nombre}</span>
              </div>
            )}
            {data.pedido_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pedido</span>
                <Link to="/admin/pedidos/$id" params={{ id: data.pedido_id }} className="text-primary hover:underline">
                  Ver pedido
                </Link>
              </div>
            )}
          </div>

          {data.notas && (
            <div className="rounded-md border border-border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Notas</h2>
              <p className="text-sm whitespace-pre-wrap">{data.notas}</p>
            </div>
          )}

          <div className="rounded-md border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">Timbrado CFDI 4.0</h2>
            {data.uuid_fiscal ? (
              <>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">UUID</span>
                    <span className="font-mono truncate max-w-[180px]" title={data.uuid_fiscal}>{data.uuid_fiscal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estado</span>
                    <span className={data.cfdi_status === "canceled" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}>
                      {data.cfdi_status ?? "valid"}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => descargar("pdf")} className="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted">PDF</button>
                  <button onClick={() => descargar("xml")} className="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted">XML</button>
                  <button onClick={() => descargar("zip")} className="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted">ZIP</button>
                </div>
                <button
                  onClick={() => {
                    const email = prompt("Enviar CFDI al correo:", data.cliente?.email ?? "");
                    if (email !== null) enviarCorreo.mutate(email || undefined);
                  }}
                  className="w-full rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                >
                  Enviar por correo
                </button>
                {data.cfdi_status !== "canceled" && (
                  <button
                    onClick={() => {
                      const m = prompt("Motivo SAT (01=Errores con relación, 02=Errores sin relación, 03=No se llevó a cabo, 04=Sustituye a otro):", "02");
                      if (m && ["01","02","03","04"].includes(m)) cancelarCfdi.mutate(m as any);
                    }}
                    disabled={cancelarCfdi.isPending}
                    className="w-full rounded-md border border-destructive bg-destructive/10 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/20"
                  >
                    {cancelarCfdi.isPending ? "Cancelando…" : "Cancelar CFDI ante SAT"}
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Esta factura aún no ha sido timbrada.</p>
                <button
                  onClick={() => timbrar.mutate()}
                  disabled={timbrar.isPending || data.estado === "cancelada"}
                  className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {timbrar.isPending ? "Timbrando…" : "Timbrar con Facturapi"}
                </button>
              </>
            )}
          </div>

          {data.estado !== "cancelada" && (
            <button
              onClick={() => { if (confirm("¿Cancelar esta factura? No se podrán registrar más pagos.")) cancelarFactura.mutate(); }}
              className="w-full rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive/20"
            >
              Cancelar factura
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
