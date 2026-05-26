import React from "react";
import type { ManiobraOrder } from "@/components/maniobra-page";

interface EnrichedTruck {
  id: string;
  transport_name: string;
  capacity_bultos: number;
  label: string;
  order_ids: string[];
  orders: ManiobraOrder[];
  totalBultos: number;
  over: number;
}

type Props = {
  trucks: EnrichedTruck[];
  date: string;
};

/**
 * Carga manifest PNG. Visual language mirrors SingleOrderImageCard
 * (the Pedidos PNG) so the two artifacts feel like one set:
 *   - same theme-aware palette (white in light, navy in dark)
 *   - same big title + blue code header pattern
 *   - same metadata strip with FECHA / CAMIONES / BULTOS labels
 *   - same product table with subtle alternating row banding
 *   - same thumbnail wrapper (theme bg + padding so dark product art
 *     blends regardless of source image transparency)
 *
 * Was previously a blue-bordered light-blue card stack that fought
 * the rest of the document — completely different visual language
 * from /pedidos exports.
 */
export const CargaImageCard = React.forwardRef<HTMLDivElement, Props>(
  ({ trucks, date }, ref) => {
    const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
    const bg = isDark ? "#020817" : "#ffffff";
    const fg = isDark ? "#f8fafc" : "#020817";
    const muted = isDark ? "#94a3b8" : "#64748b";
    const separator = isDark ? "rgba(248,250,252,0.10)" : "rgba(2,8,23,0.10)";
    const rowBg = isDark ? "rgba(248,250,252,0.03)" : "rgba(2,8,23,0.02)";
    const codeColor = isDark ? "#60a5fa" : "#2563eb";
    const tnum: React.CSSProperties = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1, "lnum" 1' };

    const fmtDate = (() => {
      const [y, m, d] = date.split("-");
      return `${d}/${m}/${y}`;
    })();

    const totalBultos = trucks.reduce((s, t) => s + t.totalBultos, 0);
    const totalOrders = trucks.reduce((s, t) => s + t.orders.length, 0);

    return (
      <div
        ref={ref}
        style={{
          position: "fixed", top: 0, left: 0, transform: "translateX(-200vw)",
          pointerEvents: "none", zIndex: 0,
          width: 900,
          backgroundColor: bg, color: fg,
          fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
          padding: 48, boxSizing: "border-box",
          fontFeatureSettings: '"ss01" 1',
        }}
      >
        {/* ─── Header (matches "Pedido P-XXXX" pattern from /pedidos) ─── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.05 }}>Carga</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: codeColor, fontFamily: "'SF Mono', Menlo, monospace", marginTop: 2, ...tnum }}>
              {fmtDate}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Generado</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, ...tnum }}>{fmtDate}</div>
          </div>
        </div>
        <div style={{ height: 2, background: fg, opacity: 0.85, marginTop: 14, marginBottom: 28 }} />

        {/* ─── Metadata strip ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Camiones</div>
            <div style={{ fontSize: 22, fontWeight: 700, ...tnum }}>{trucks.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Pedidos</div>
            <div style={{ fontSize: 22, fontWeight: 700, ...tnum }}>{totalOrders}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Bultos totales</div>
            <div style={{ fontSize: 22, fontWeight: 700, ...tnum }}>{totalBultos}</div>
          </div>
        </div>

        {/* ─── Trucks ─── */}
        {trucks.map((truck, idx) => {
          const priorityLabel = idx === 0
            ? "CARGAR PRIMERO"
            : idx === 1
              ? "CARGAR SEGUNDO"
              : idx === 2
                ? "CARGAR TERCERO"
                : `CARGAR #${idx + 1}`;
          const clientNames = truck.orders.map((o) => o.client_name).join(" · ");

          return (
            <div key={truck.id} style={{ marginBottom: 32 }}>
              {/* Truck header — same column header pattern as Pedidos */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {idx === 0 && <span style={{ fontSize: 16, color: "#F59E0B" }}>★</span>}
                    <span style={{ fontSize: 20, fontWeight: 700 }}>{truck.label}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: codeColor,
                      textTransform: "uppercase", letterSpacing: "0.08em",
                    }}>
                      {priorityLabel}
                    </span>
                    {truck.over > 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: "#EA580C",
                        backgroundColor: isDark ? "rgba(234,88,12,0.15)" : "#FFF7ED",
                        border: "1px solid rgba(234,88,12,0.4)",
                        padding: "2px 6px", borderRadius: 4,
                      }}>
                        +{truck.over}
                      </span>
                    )}
                  </div>
                  {clientNames && (
                    <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>{clientNames}</div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, ...tnum }}>{truck.totalBultos}</div>
                  <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    / {truck.capacity_bultos} bultos
                  </div>
                </div>
              </div>

              {/* Items table — matches Pedidos table styling exactly */}
              {truck.orders.map((order, oi) => (
                <div key={order.order_id} style={{ marginBottom: oi < truck.orders.length - 1 ? 18 : 0 }}>
                  {/* Order sub-header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0 8px", borderTop: oi === 0 ? `2px solid ${separator}` : "none" }}>
                    <span style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 14, fontWeight: 700, color: codeColor }}>
                      {order.order_code}
                    </span>
                    <span style={{ fontSize: 13, color: muted }}>· {order.client_name}</span>
                    <span style={{ fontSize: 12, color: muted, marginLeft: "auto", ...tnum }}>
                      {order.total_bultos} bultos
                    </span>
                  </div>

                  {/* Items */}
                  {order.items.map((item, j) => (
                    <div key={j} style={{
                      display: "grid",
                      gridTemplateColumns: "72px 1fr auto",
                      alignItems: "center",
                      gap: 14,
                      padding: "10px 12px",
                      backgroundColor: j % 2 === 1 ? rowBg : "transparent",
                      borderTop: `1px solid ${separator}`,
                    }}>
                      {/* Thumbnail wrapper — same as Pedidos PNG */}
                      <div style={{
                        width: 56, height: 56,
                        background: bg,
                        borderRadius: 8,
                        border: `1px solid ${separator}`,
                        padding: 8, boxSizing: "border-box",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt=""
                            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                          />
                        ) : (
                          <span style={{ display: "inline-block", width: 18, height: 18, border: `2px solid ${muted}`, borderRadius: 3 }} />
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{item.product_name}</div>
                        <div style={{ fontSize: 12, color: muted, fontFamily: "'SF Mono', Menlo, monospace", marginTop: 2 }}>{item.product_clave}</div>
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, ...tnum }}>x{item.quantity}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })}

        {/* Footer */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${separator}`, textAlign: "center", fontSize: 11, color: muted, letterSpacing: "0.04em" }}>
          MANIOBRA · {fmtDate}
        </div>
      </div>
    );
  }
);
CargaImageCard.displayName = "CargaImageCard";
