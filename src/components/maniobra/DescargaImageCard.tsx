import React from "react";
import type { ManiobraDescarga } from "@/components/maniobra-page";

type Props = {
  descarga: ManiobraDescarga;
  date: string;
  truckClientNames?: Map<string, string[]>;
};

export const DescargaImageCard = React.forwardRef<HTMLDivElement, Props>(
  ({ descarga, date, truckClientNames }, ref) => {
    const crossDockItems = descarga.items.filter((i) => i.destination !== "warehouse");
    const warehouseItems = descarga.items.filter((i) => i.destination === "warehouse");

    const crossDockByTruck = new Map<string, typeof crossDockItems>();
    for (const item of crossDockItems) {
      const arr = crossDockByTruck.get(item.destination) ?? [];
      arr.push(item);
      crossDockByTruck.set(item.destination, arr);
    }

    const hasCrossDock = crossDockByTruck.size > 0;

    const fmtDate = (() => {
      const [y, m, d] = date.split("-");
      return `${d}/${m}/${y}`;
    })();

    const amber = "#D97706";
    const amberBg = "#FFF7ED";
    const amberBorder = "#FDE68A";
    const green = "#16A34A";
    const greenBg = "#F0FDF4";
    const muted = "#64748b";
    const separator = "rgba(2,8,23,0.08)";
    const tnum: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

    return (
      <div
        ref={ref}
        style={{
          position: "fixed", top: 0, left: 0, transform: "translateX(-200vw)",
          pointerEvents: "none", zIndex: 0, width: 600,
          backgroundColor: "#ffffff", color: "#0f172a",
          fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
          padding: 32, boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>📦 Descarga</div>
            <div style={{ fontSize: 14, color: muted, marginTop: 6 }}>{descarga.total_bultos} bultos total</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 600, ...tnum }}>{fmtDate}</div>
          </div>
        </div>
        <div style={{ height: 3, background: "#1e293b", borderRadius: 2, marginBottom: 24 }} />

        {/* Cross-dock section */}
        {hasCrossDock && (
          <div style={{
            border: `2px solid ${amberBorder}`, borderRadius: 12, padding: 20,
            marginBottom: 20, backgroundColor: amberBg,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: amber }}>TRASPALEAR — PASA DIRECTO AL CAMIÓN</span>
            </div>

            {[...crossDockByTruck.entries()].map(([truckLabel, items], gi) => {
              const clientNames = truckClientNames?.get(truckLabel) ?? [];
              return (
                <div key={gi} style={{ marginBottom: gi < crossDockByTruck.size - 1 ? 16 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, color: amber }}>→</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: amber }}>{truckLabel}</span>
                    {clientNames.length > 0 && (
                      <span style={{ fontSize: 13, color: muted }}>· {clientNames.join(", ")}</span>
                    )}
                    <span style={{ fontSize: 12, color: amber, marginLeft: 4 }}>
                      ({items.reduce((s, i) => s + i.quantity, 0)} bultos)
                    </span>
                  </div>
                  {items.map((item, j) => (
                    <div key={j} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "8px 0",
                      borderBottom: j < items.length - 1 ? `1px solid ${amberBorder}` : "none",
                      marginLeft: 20,
                    }}>
                      {item.image_url ? (
                        <img src={item.image_url} style={{ width: 70, height: 70, borderRadius: 6, objectFit: "cover", border: `1px solid ${amberBorder}` }} />
                      ) : (
                        <div style={{ width: 70, height: 70, borderRadius: 6, backgroundColor: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📦</div>
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{item.product_name}</div>
                        <div style={{ fontSize: 11, color: muted }}>{item.product_clave}</div>
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, ...tnum }}>x{item.quantity}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Warehouse section */}
        {warehouseItems.length > 0 && (
          <div style={{
            border: `1px solid ${separator}`, borderRadius: 12, padding: 20, backgroundColor: greenBg,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 16, color: green }}>🟢</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: green }}>
                {hasCrossDock ? "RESTO → ALMACÉN" : "BAJAR TODO AL ALMACÉN"}
              </span>
              <span style={{ fontSize: 13, color: muted, marginLeft: 6 }}>
                ({warehouseItems.reduce((s, i) => s + i.quantity, 0)} bultos)
              </span>
            </div>
            {warehouseItems.map((item, j) => (
              <div key={j} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "8px 0",
                borderBottom: j < warehouseItems.length - 1 ? `1px solid ${separator}` : "none",
              }}>
                {item.image_url ? (
                  <img src={item.image_url} style={{ width: 70, height: 70, borderRadius: 6, objectFit: "cover", border: `1px solid ${separator}` }} />
                ) : (
                  <div style={{ width: 70, height: 70, borderRadius: 6, backgroundColor: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📦</div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{item.product_name}</div>
                  <div style={{ fontSize: 11, color: muted }}>{item.product_clave}</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, ...tnum }}>x{item.quantity}</div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 20, textAlign: "center", fontSize: 12, color: muted }}>
          Maniobra · {fmtDate}
        </div>
      </div>
    );
  }
);
DescargaImageCard.displayName = "DescargaImageCard";
