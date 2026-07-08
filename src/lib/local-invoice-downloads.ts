import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

type LocalInvoice = {
  id: string;
  folio: string | null;
  serie: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  estado: string | null;
  uuid_fiscal: string | null;
  facturapi_id: string | null;
  cliente_id: string;
};

type LocalClient = {
  razon_social: string | null;
  nombre_comercial: string | null;
  rfc: string | null;
  email: string | null;
  direccion: string | null;
  codigo_postal: string | null;
  regimen_fiscal: string | null;
};

type LocalInvoiceItem = {
  nombre_snapshot: string;
  sku_snapshot: string | null;
  unidad_snapshot: string | null;
  cantidad: number;
  precio_unitario: number;
  iva_pct: number | null;
  importe: number | null;
};

const money = (value: unknown) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value ?? 0));

const safeFilePart = (value: string) => value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);

const escapeXml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

async function loadLocalInvoice(facturaId: string) {
  const { data: invoice, error: invoiceError } = await supabase
    .from("facturas")
    .select("id, folio, serie, fecha_emision, fecha_vencimiento, subtotal, iva, total, estado, uuid_fiscal, facturapi_id, cliente_id")
    .eq("id", facturaId)
    .single();
  if (invoiceError) throw invoiceError;

  const { data: client, error: clientError } = await supabase
    .from("clientes")
    .select("razon_social, nombre_comercial, rfc, email, direccion, codigo_postal, regimen_fiscal")
    .eq("id", (invoice as LocalInvoice).cliente_id)
    .maybeSingle();
  if (clientError) throw clientError;

  const { data: items, error: itemsError } = await supabase
    .from("factura_items")
    .select("nombre_snapshot, sku_snapshot, unidad_snapshot, cantidad, precio_unitario, iva_pct, importe")
    .eq("factura_id", facturaId)
    .order("nombre_snapshot");
  if (itemsError) throw itemsError;

  return {
    invoice: invoice as LocalInvoice,
    client: (client ?? null) as LocalClient | null,
    items: (items ?? []) as LocalInvoiceItem[],
  };
}

export async function downloadLocalInvoicePdf(facturaId: string) {
  const { invoice, client, items } = await loadLocalInvoice(facturaId);
  const label = [invoice.serie, invoice.folio].filter(Boolean).join("-") || invoice.folio || invoice.id;
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Factura", 40, 48);
  doc.setFontSize(12);
  doc.text(label, 40, 68);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Estado: ${invoice.estado ?? "—"}`, 420, 48);
  doc.text(`Emisión: ${invoice.fecha_emision ?? "—"}`, 420, 64);
  doc.text(`Vencimiento: ${invoice.fecha_vencimiento ?? "—"}`, 420, 80);
  if (!invoice.uuid_fiscal) {
    doc.setTextColor(180, 95, 0);
    doc.text("Documento interno — CFDI no timbrado", 40, 92);
    doc.setTextColor(0, 0, 0);
  }

  const clientName = client?.razon_social || client?.nombre_comercial || "Cliente";
  doc.setFont("helvetica", "bold");
  doc.text("Cliente", 40, 122);
  doc.setFont("helvetica", "normal");
  doc.text(clientName, 40, 140, { maxWidth: 260 });
  doc.text(`RFC: ${client?.rfc ?? "—"}`, 40, 156);
  doc.text(`CP: ${client?.codigo_postal ?? "—"}`, 40, 172);
  if (client?.direccion) doc.text(client.direccion, 40, 188, { maxWidth: 320 });

  autoTable(doc, {
    startY: 220,
    head: [["Cantidad", "Clave", "Descripción", "P. unitario", "Importe"]],
    body: items.map((item) => [
      Number(item.cantidad ?? 0).toLocaleString("es-MX"),
      item.sku_snapshot ?? "—",
      item.nombre_snapshot,
      money(item.precio_unitario),
      money(item.importe ?? Number(item.cantidad ?? 0) * Number(item.precio_unitario ?? 0)),
    ]),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [15, 23, 42] },
    columnStyles: {
      0: { halign: "right", cellWidth: 58 },
      1: { cellWidth: 70 },
      3: { halign: "right", cellWidth: 78 },
      4: { halign: "right", cellWidth: 78 },
    },
  });

  const y = Math.max((doc as any).lastAutoTable?.finalY ?? 220, 220) + 26;
  doc.setFontSize(10);
  doc.text(`Subtotal: ${money(invoice.subtotal)}`, 420, y);
  doc.text(`IVA: ${money(invoice.iva)}`, 420, y + 16);
  doc.setFont("helvetica", "bold");
  doc.text(`Total: ${money(invoice.total)}`, 420, y + 34);

  doc.save(`${safeFilePart(label)}.pdf`);
}

export async function downloadLocalInvoiceXml(facturaId: string) {
  const { invoice, client, items } = await loadLocalInvoice(facturaId);
  const label = [invoice.serie, invoice.folio].filter(Boolean).join("-") || invoice.folio || invoice.id;
  const lines = items.map((item) => `    <concepto cantidad="${escapeXml(item.cantidad)}" clave="${escapeXml(item.sku_snapshot)}" descripcion="${escapeXml(item.nombre_snapshot)}" unidad="${escapeXml(item.unidad_snapshot)}" precio_unitario="${escapeXml(item.precio_unitario)}" importe="${escapeXml(item.importe)}" />`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<factura_interna id="${escapeXml(invoice.id)}" folio="${escapeXml(label)}" estado="${escapeXml(invoice.estado)}" cfdi_timbrado="${invoice.uuid_fiscal ? "true" : "false"}">
  <cliente nombre="${escapeXml(client?.razon_social || client?.nombre_comercial)}" rfc="${escapeXml(client?.rfc)}" codigo_postal="${escapeXml(client?.codigo_postal)}" />
  <conceptos>
${lines}
  </conceptos>
  <totales subtotal="${escapeXml(invoice.subtotal)}" iva="${escapeXml(invoice.iva)}" total="${escapeXml(invoice.total)}" />
</factura_interna>
`;
  downloadBlob(new Blob([xml], { type: "application/xml;charset=utf-8" }), `${safeFilePart(label)}.xml`);
}