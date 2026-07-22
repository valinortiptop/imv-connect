import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

export type ExportStop = {
  cliente_id: string;
  nombre?: string | null;
  direccion?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type ExportLeg = {
  distance_km?: number;
  duration_min?: number;
  distance_text?: string;
  duration_text?: string;
};

export type ExportRoute = {
  title?: string;
  fecha?: string | null;
  totalKm?: number | null;
  totalMin?: number | null;
  stops: ExportStop[];
  legs?: ExportLeg[];
};

function fmtLeg(leg?: ExportLeg) {
  if (!leg) return "";
  const d = leg.distance_text || (leg.distance_km != null ? `${leg.distance_km} km` : "");
  const t = leg.duration_text || (leg.duration_min != null ? `${leg.duration_min} min` : "");
  return [d, t].filter(Boolean).join(" · ");
}

export function downloadRoutePdf(route: ExportRoute) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const title = route.title || "Ruta";
  doc.setFontSize(16);
  doc.text(title, 40, 48);
  doc.setFontSize(10);
  doc.setTextColor(90);
  const meta = [
    route.fecha ? `Fecha: ${route.fecha}` : null,
    `${route.stops.length} paradas`,
    route.totalKm != null ? `${route.totalKm} km` : null,
    route.totalMin != null ? `${route.totalMin} min` : null,
  ].filter(Boolean).join(" · ");
  doc.text(meta, 40, 66);

  autoTable(doc, {
    startY: 84,
    head: [["#", "Cliente", "Dirección", "Tramo"]],
    body: route.stops.map((s, i) => [
      String(i + 1),
      s.nombre || "Cliente",
      s.direccion || "",
      fmtLeg(route.legs?.[i]),
    ]),
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [17, 17, 17] },
    columnStyles: {
      0: { cellWidth: 24, halign: "center" },
      3: { cellWidth: 110 },
    },
  });

  const fname = `${(title || "ruta").replace(/[^a-z0-9-_]+/gi, "_")}-${
    route.fecha || new Date().toISOString().slice(0, 10)
  }.pdf`;
  doc.save(fname);
}

export function printRoute(route: ExportRoute) {
  const title = route.title || "Ruta";
  const rows = route.stops
    .map((s, i) => {
      const legTxt = fmtLeg(route.legs?.[i]);
      return `<tr><td style="padding:8px;border-bottom:1px solid #eee;text-align:center;font-weight:700">${
        i + 1
      }</td><td style="padding:8px;border-bottom:1px solid #eee"><div style="font-weight:600">${
        s.nombre || "Cliente"
      }</div><div style="color:#666;font-size:12px">${
        s.direccion || ""
      }</div></td><td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;color:#333;white-space:nowrap">${legTxt}</td></tr>`;
    })
    .join("");
  const meta = [
    route.fecha ? `Fecha: <strong>${route.fecha}</strong>` : null,
    route.totalKm != null ? `<strong>${route.totalKm} km</strong>` : null,
    route.totalMin != null ? `<strong>${route.totalMin} min</strong>` : null,
    `${route.stops.length} paradas`,
  ]
    .filter(Boolean)
    .join(" · ");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#111">
<h1 style="margin:0 0 4px">${title}</h1>
<p style="margin:0 0 16px;color:#555">${meta}</p>
<table style="width:100%;border-collapse:collapse;border-top:2px solid #111">${rows}</table>
<script>window.onload=function(){setTimeout(function(){window.print();},250);}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) {
    toast.error("Permite ventanas emergentes para imprimir");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
