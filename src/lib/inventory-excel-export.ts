/**
 * Inventory → Excel export (with thumbnails).
 *
 * Builds a single-sheet .xlsx with the same columns the Inventory page
 * shows on screen, minus the monetary value: thumbnail, clave, name,
 * supplier, stock_actual, stock_committed, stock_disponible,
 * stock_incoming.
 *
 * exceljs is the only Excel lib in our stack that supports embedded
 * images cleanly. We dynamic-import it so it doesn't bloat the main
 * bundle (only loaded when the user clicks "Descargar Excel").
 *
 * Image strategy: fetch each product image, resize to a 64×64 JPEG via
 * canvas (~3-8 KB each), embed in the cell. Without the resize, the
 * file balloons by ~1 MB per 10 products.
 */
import { format } from "date-fns";

/** Shape we need from each inventory row. Keep it permissive — the
 *  Inventory page passes its richer InventoryItem in. */
export interface ExportInventoryRow {
  clave: string;
  name: string;
  supplier: string | null;
  image_url: string | null;
  stock_actual: number;
  stock_committed: number;
  stock_disponible: number;
  stock_incoming: number;
}

/** Fetch + downscale to a small JPEG base64 (data: URL). Returns null
 *  if the image can't be loaded (CORS, 404, etc) — the cell is left
 *  empty in that case so the row still exports cleanly. */
async function fetchThumbnailBase64(url: string, size = 64): Promise<string | null> {
  try {
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // White matte so any transparency reads cleanly on the Excel cell.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    // Letterbox the image to a square so non-square sources don't squish.
    const scale = Math.min(size / bitmap.width, size / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}

/** Main entry. Pops a save-as for the generated Inventario YYYY-MM-DD.xlsx */
export async function downloadInventoryExcel(
  rows: ExportInventoryRow[],
  options: { fileLabel?: string; onProgress?: (done: number, total: number) => void } = {},
): Promise<void> {
  if (rows.length === 0) return;

  // Dynamic import keeps exceljs out of the main bundle.
  const ExcelJS = (await import("exceljs")).default;

  const wb = new ExcelJS.Workbook();
  wb.creator = "croquetapp";
  wb.created = new Date();
  const ws = wb.addWorksheet("Inventario", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = [
    { header: "#",            key: "idx",       width: 5 },
    { header: "Imagen",       key: "img",       width: 11 },
    { header: "Clave",        key: "clave",     width: 14 },
    { header: "Producto",     key: "name",      width: 48 },
    { header: "Proveedor",    key: "supplier",  width: 18 },
    { header: "Stock",        key: "stock",     width: 10 },
    { header: "Comprometido", key: "committed", width: 14 },
    { header: "Disponible",   key: "available", width: 12 },
    { header: "En camino",    key: "incoming",  width: 12 },
  ];

  // Header row: bold, dark background, white text.
  const header = ws.getRow(1);
  header.height = 22;
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  header.alignment = { vertical: "middle", horizontal: "center" };
  header.eachCell((cell: any) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF111827" },
    };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF374151" } },
    };
  });

  // Fetch all thumbnails in parallel. Capped at ~10 concurrent to be
  // polite to the Supabase storage origin.
  const concurrency = 10;
  const thumbnails = new Array<string | null>(rows.length).fill(null);
  let done = 0;
  options.onProgress?.(0, rows.length);

  const queue = rows.map((r, i) => ({ r, i }));
  async function worker() {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) break;
      if (job.r.image_url) {
        thumbnails[job.i] = await fetchThumbnailBase64(job.r.image_url, 64);
      }
      done++;
      options.onProgress?.(done, rows.length);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  // Body rows
  rows.forEach((r, i) => {
    const rowNum = i + 2;
    const row = ws.getRow(rowNum);
    row.height = 50; // tall enough for the 48 px image with padding
    row.getCell("idx").value = i + 1;
    row.getCell("clave").value = r.clave;
    row.getCell("name").value = r.name;
    row.getCell("supplier").value = r.supplier ?? "—";
    row.getCell("stock").value = r.stock_actual;
    row.getCell("committed").value = r.stock_committed;
    row.getCell("available").value = r.stock_disponible;
    row.getCell("incoming").value = r.stock_incoming;

    row.alignment = { vertical: "middle" };
    row.getCell("idx").alignment       = { vertical: "middle", horizontal: "center" };
    row.getCell("clave").alignment     = { vertical: "middle", horizontal: "left" };
    row.getCell("name").alignment      = { vertical: "middle", horizontal: "left", wrapText: true };
    row.getCell("supplier").alignment  = { vertical: "middle", horizontal: "left" };
    row.getCell("stock").alignment     = { vertical: "middle", horizontal: "right" };
    row.getCell("committed").alignment = { vertical: "middle", horizontal: "right" };
    row.getCell("available").alignment = { vertical: "middle", horizontal: "right" };
    row.getCell("incoming").alignment  = { vertical: "middle", horizontal: "right" };

    // Subtle alternating banding for readability.
    if (i % 2 === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF9FAFB" },
        };
      });
    }

    // Embed the thumbnail in the Imagen cell (column B, index 1).
    const b64 = thumbnails[i];
    if (b64) {
      const imageId = wb.addImage({ base64: b64, extension: "jpeg" });
      ws.addImage(imageId, {
        tl: { col: 1.15, row: rowNum - 1 + 0.1 },
        ext: { width: 48, height: 48 },
        editAs: "oneCell",
      });
    }
  });

  // Generate + download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const fileLabel = options.fileLabel ?? format(new Date(), "yyyy-MM-dd");
  const filename = `Inventario ${fileLabel}.xlsx`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
