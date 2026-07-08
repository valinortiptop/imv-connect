import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Server-only helpers loaded inside handlers to avoid client bundling.

const stampInput = z.object({ facturaId: z.string().uuid() });
const cancelInput = z.object({
  facturaId: z.string().uuid(),
  motivo: z.enum(["01", "02", "03", "04"]),
  substitution: z.string().uuid().optional(),
});
const downloadInput = z.object({
  facturaId: z.string().uuid(),
  format: z.enum(["pdf", "xml", "zip"]),
});
const sendEmailInput = z.object({
  facturaId: z.string().uuid(),
  email: z.string().email().optional(),
});
const catalogInput = z.object({
  kind: z.enum(["products", "units", "tax_systems", "uses_cfdi"]),
  q: z.string().max(200).optional(),
});

function pickUsoCfdi(uso?: string | null): string {
  // Facturapi expects the SAT key (G01, G03, P01, S01, etc.)
  const v = (uso ?? "").trim();
  if (/^[A-Z]\d{2}$/.test(v)) return v;
  // Common labels → SAT
  const map: Record<string, string> = {
    "adquisición de mercancías": "G01",
    "gastos en general": "G03",
    "por definir": "S01",
  };
  return map[v.toLowerCase()] ?? "G03";
}

function pickPaymentForm(pf?: string | null): string {
  const v = (pf ?? "").trim();
  if (/^\d{2}$/.test(v)) return v;
  const map: Record<string, string> = {
    efectivo: "01",
    cheque: "02",
    transferencia: "03",
    tarjeta: "04",
    debito: "28",
    credito: "04",
  };
  return map[v.toLowerCase()] ?? "99";
}

export const stampInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => stampInput.parse(v))
  .handler(async ({ data }) => {
    const { fxInvoices } = await import("./facturapi.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: factura, error } = await supabaseAdmin
      .from("facturas")
      .select(
        "id, folio, fecha_emision, subtotal, iva, total, cfdi_use, payment_form, payment_method, uuid_fiscal, facturapi_id, cliente:clientes(id, razon_social, nombre_comercial, rfc, email, regimen_fiscal, uso_cfdi_default, codigo_postal, address, direccion, facturapi_id), factura_items(id, nombre_snapshot, sku_snapshot, unidad_snapshot, cantidad, precio_unitario, iva_pct, ieps_pct, importe)",
      )
      .eq("id", data.facturaId)
      .single();
    if (error) throw new Error(error.message);
    if (!factura) throw new Error("Factura no encontrada");
    if ((factura as any).uuid_fiscal) throw new Error("Esta factura ya fue timbrada");

    const cliente: any = (factura as any).cliente;
    if (!cliente?.rfc) throw new Error("El cliente no tiene RFC");
    if (!cliente?.codigo_postal) throw new Error("El cliente no tiene código postal fiscal");

    const items = ((factura as any).factura_items ?? []) as any[];
    if (!items.length) throw new Error("La factura no tiene conceptos");

    const uso = pickUsoCfdi((factura as any).cfdi_use ?? cliente.uso_cfdi_default);
    const forma = pickPaymentForm((factura as any).payment_form);
    const metodo = ((factura as any).payment_method as "PUE" | "PPD" | null) ?? "PUE";

    const payload: any = {
      customer: cliente.facturapi_id
        ? cliente.facturapi_id
        : {
            legal_name: cliente.razon_social || cliente.nombre_comercial || "PUBLICO EN GENERAL",
            tax_id: (cliente.rfc as string).toUpperCase(),
            tax_system: cliente.regimen_fiscal || "601",
            email: cliente.email || undefined,
            address: { zip: String(cliente.codigo_postal) },
          },
      items: items.map((it) => ({
        quantity: Number(it.cantidad),
        product: {
          description: it.nombre_snapshot,
          product_key: "01010101", // default genérico SAT — override desde producto en fase posterior
          price: Number(it.precio_unitario),
          sku: it.sku_snapshot || undefined,
          unit_name: it.unidad_snapshot || "Pieza",
          tax_included: false,
          taxes: [{ type: "IVA", rate: Number(it.iva_pct ?? 0.16) }],
        },
      })),
      use: uso,
      payment_form: forma,
      payment_method: metodo,
      folio_number: Number((factura as any).folio) || undefined,
      external_id: (factura as any).id,
    };

    const inv: any = await fxInvoices.create(payload);

    const { error: upErr } = await supabaseAdmin
      .from("facturas")
      .update({
        facturapi_id: inv.id,
        uuid_fiscal: inv.uuid,
        serie: inv.series ?? null,
        cfdi_status: inv.status ?? "valid",
        cfdi_use: uso,
        payment_form: forma,
        payment_method: metodo,
        pdf_url: `https://www.facturapi.io/v2/invoices/${inv.id}/pdf`,
        xml_url: `https://www.facturapi.io/v2/invoices/${inv.id}/xml`,
      })
      .eq("id", data.facturaId);
    if (upErr) throw new Error(upErr.message);

    // Cache facturapi customer id
    if (!cliente.facturapi_id && inv.customer?.id) {
      await supabaseAdmin.from("clientes").update({ facturapi_id: inv.customer.id }).eq("id", cliente.id);
    }

    return { ok: true, uuid: inv.uuid, id: inv.id };
  });

export const cancelInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => cancelInput.parse(v))
  .handler(async ({ data }) => {
    const { fxInvoices } = await import("./facturapi.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: f } = await supabaseAdmin
      .from("facturas")
      .select("id, facturapi_id")
      .eq("id", data.facturaId)
      .single();
    if (!f?.facturapi_id) throw new Error("La factura no está timbrada");

    const res: any = await fxInvoices.cancel(f.facturapi_id, data.motivo, data.substitution);
    await supabaseAdmin
      .from("facturas")
      .update({
        cfdi_status: res.status ?? "canceled",
        cancel_motivo: data.motivo,
        canceled_at: new Date().toISOString(),
      })
      .eq("id", data.facturaId);
    return { ok: true };
  });

export const downloadInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => downloadInput.parse(v))
  .handler(async ({ data }) => {
    const { fxInvoices } = await import("./facturapi.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: f } = await supabaseAdmin
      .from("facturas")
      .select("facturapi_id")
      .eq("id", data.facturaId)
      .single();
    if (!f?.facturapi_id) throw new Error("La factura no está timbrada");

    const map = { pdf: fxInvoices.downloadPdf, xml: fxInvoices.downloadXml, zip: fxInvoices.downloadZip };
    const { body, contentType } = await map[data.format](f.facturapi_id);
    const base64 = Buffer.from(body).toString("base64");
    return { base64, contentType, filename: `${f.facturapi_id}.${data.format}` };
  });

export const sendInvoiceEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => sendEmailInput.parse(v))
  .handler(async ({ data }) => {
    const { fxInvoices } = await import("./facturapi.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: f } = await supabaseAdmin
      .from("facturas")
      .select("facturapi_id")
      .eq("id", data.facturaId)
      .single();
    if (!f?.facturapi_id) throw new Error("La factura no está timbrada");
    await fxInvoices.sendByEmail(f.facturapi_id, data.email);
    return { ok: true };
  });

export const listSatCatalogFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => catalogInput.parse(v))
  .handler(async ({ data }) => {
    const { fxCatalogs } = await import("./facturapi.server");
    if (data.kind === "products") return fxCatalogs.products(data.q ?? "");
    if (data.kind === "units") return fxCatalogs.units(data.q ?? "");
    if (data.kind === "tax_systems") return fxCatalogs.taxSystems();
    return fxCatalogs.usesOfCfdi();
  });
