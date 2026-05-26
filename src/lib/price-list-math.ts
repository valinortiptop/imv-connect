// @ts-nocheck
/**
 * Price-list math: resolve a product's effective price for a given list.
 *
 * Resolution order:
 *   1. Explicit override row in `price_list_items` (manual price set in
 *      /listas-de-precios)
 *   2. List's `markup_pct` applied to mayoreo (e.g. Menudeo +4%, Habid −4%)
 *   3. Mayoreo (`products.sale_price_with_iva`) as a final fallback
 *
 * Centralised here so Catalogo, AvailabilityDownloadDialog, NewOrderDialog,
 * EditQuoteSheet, and EditOrderSheet stay consistent. Add a new caller? Use
 * `resolveListPrice` instead of re-implementing the fallback chain.
 */

export interface PriceListInfo {
  id: string;
  name: string;
  /** Signed percentage applied to mayoreo when no override exists.
   *  Positive = markup (Menudeo +4%), negative = discount (Habid −4%),
   *  null = no formula → fall through to mayoreo. */
  markup_pct: number | null;
}

/**
 * Compute the price for `mayoreoPrice` on a list with `markupPct`.
 * - markupPct > 0: marks UP (mayoreo + %)
 * - markupPct < 0: marks DOWN (mayoreo - %)
 * - markupPct null/0/NaN: returns mayoreo unchanged
 *
 * Output is rounded to 2 decimals so display + math stay aligned.
 */
export function applyMarkup(mayoreoPrice: number, markupPct: number | null): number {
  if (mayoreoPrice == null || !Number.isFinite(mayoreoPrice)) return 0;
  if (markupPct == null || !Number.isFinite(markupPct) || markupPct === 0) return mayoreoPrice;
  return Math.round(mayoreoPrice * (1 + markupPct / 100) * 100) / 100;
}

/**
 * Full resolution: override → markup formula → mayoreo.
 *
 * `overrideMap` is the result of `SELECT product_id, price_with_iva FROM
 * price_list_items WHERE price_list_id = <selected>` keyed by product_id.
 * Pass an empty map (or undefined) when there are no overrides — the
 * formula or mayoreo still apply.
 */
export function resolveListPrice(
  productId: string,
  mayoreoPrice: number | null | undefined,
  list: PriceListInfo | null | undefined,
  overrideMap?: Map<string, number> | Record<string, number>,
): number {
  const mayoreo = Number(mayoreoPrice) || 0;
  if (!list) return mayoreo;

  // 1. Explicit override
  const override = overrideMap instanceof Map
    ? overrideMap.get(productId)
    : (overrideMap as Record<string, number> | undefined)?.[productId];
  if (override != null && Number.isFinite(Number(override))) return Number(override);

  // 2. Markup formula
  return applyMarkup(mayoreo, list.markup_pct);
}

/**
 * Human-readable label for a list's markup, e.g. "+4%" or "−4%".
 * Returns empty string when there's no formula.
 */
export function formatMarkup(markupPct: number | null | undefined): string {
  if (markupPct == null || !Number.isFinite(markupPct) || markupPct === 0) return "";
  return markupPct > 0 ? `+${markupPct}%` : `−${Math.abs(markupPct)}%`;
}

/**
 * "Recargo" or "Descuento" — UI-friendly word for positive/negative markups.
 */
export function markupNoun(markupPct: number | null | undefined): "recargo" | "descuento" | "" {
  if (markupPct == null || !Number.isFinite(markupPct) || markupPct === 0) return "";
  return markupPct > 0 ? "recargo" : "descuento";
}
