/**
 * Centralized date utilities to prevent timezone bugs.
 *
 * Problem: Date strings like "2024-04-02" are parsed as UTC midnight by
 * `new Date("2024-04-02")`. In Mexico City (UTC-6) that becomes April 1st
 * at 18:00 local, so `getDate()` returns 1 instead of 2.
 *
 * Solution: All date parsing appends "T12:00:00" so the local date is always
 * correct regardless of timezone. All date selections extract local components
 * directly to build a YYYY-MM-DD string, never going through UTC.
 */

import { format } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Parse a date string (YYYY-MM-DD) into a Date object safe for local display.
 * Appends T12:00:00 to avoid midnight-UTC timezone shift.
 */
export function parseLocalDate(d: string): Date {
  // If it's just a date (10 chars), add noon time to avoid timezone shift
  if (d.length === 10) {
    return new Date(d + "T12:00:00");
  }
  // If it already has time info, parse as-is
  return new Date(d);
}

/**
 * Convert a Date object (e.g. from Calendar picker) to a YYYY-MM-DD string
 * using LOCAL date components, avoiding any UTC conversion.
 */
export function dateToString(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Format a date string for display (dd/MM/yy).
 * Returns "—" for null/empty values.
 */
export function fmtDateShort(d: string | null): string {
  if (!d) return "—";
  try {
    return format(parseLocalDate(d), "dd/MM/yy", { locale: es });
  } catch {
    return d;
  }
}

/**
 * Calendar onSelect handler: extracts local date string from the selected Date.
 * Use this in all Calendar onSelect callbacks to prevent timezone bugs.
 *
 * Usage:
 *   onSelect={(d) => { if (d) setMyDate(calendarDateToString(d)); }}
 */
export function calendarDateToString(d: Date): string {
  return dateToString(d);
}

/**
 * Get the first day of the current month as YYYY-MM-DD.
 */
export function getFirstOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Today's date in Mexico City time as a YYYY-MM-DD string.
 * The whole app runs on MX business days — use this instead of `new Date()`
 * for any "is this in the past / future" comparison.
 */
export function todayMx(): string {
  const mx = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" })
  );
  return dateToString(mx);
}
