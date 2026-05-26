// @ts-nocheck
/**
 * Single source of truth for business contact info shown to customers
 * (PDFs, downloadable images, portal pages).
 *
 * When the new phone line is set up, edit this file:
 *   - phone: "+52 55 XXXX XXXX"  // human-readable
 *   - whatsappNumber: "55XXXXXXXX"  // 10 digits, no +52, used for wa.me links
 *   - qrImageUrl: "https://...supabase.co/storage/v1/object/public/.../qr.png"
 *
 * Set any value to null to hide that section from PDFs / pages.
 */

export const BUSINESS_CONTACT = {
  /** Human-readable phone shown on customer-facing PDFs. null = hidden. */
  phone: null as string | null,

  /** 10-digit Mexican number for wa.me deep links. null = no WhatsApp button/QR. */
  whatsappNumber: null as string | null,

  /** Public URL of the WhatsApp QR PNG (uploaded to Supabase Storage). */
  qrImageUrl: null as string | null,

  /** Default WhatsApp message used for the wa.me deep link. */
  whatsappTemplate: "Hola, vi su catálogo y me interesa hacer un pedido.",

  brandName: "Croquetapp",
};
