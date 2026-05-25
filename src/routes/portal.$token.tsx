import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/portal/$token")({
  component: PortalCliente,
});

type CatalogoItem = {
  id: string;
  sku: string | null;
  nombre: string;
  descripcion: string | null;
  presentacion: string | null;
  especie: string[] | null;
  categoria: string | null;
  imagen_url: string | null;
  unidad: string;
  iva_pct: number;
  precio: number;
  laboratorio: { id: string; nombre: string; logo_url: string | null };
};

type CatalogoResponse = {
  cliente: { id: string; razon_social: string; nombre_comercial: string | null };
  productos: CatalogoItem[];
};

type Cart = Record<string, number>; // producto_id -> cantidad

function PortalCliente() {
  const { token } = Route.useParams();
  const cartKey = `imv-cart-${token}`;
  const [cart, setCart] = useState<Cart>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(cartKey);
      if (raw) setCart(JSON.parse(raw));
    } catch { /* empty */ }
  }, [cartKey]);

  useEffect(() => {
    try { localStorage.setItem(cartKey, JSON.stringify(cart)); } catch { /* empty */ }
  }, [cart, cartKey]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-catalogo", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_catalog_for_token", { _token: token });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as unknown as CatalogoResponse;
    },
    retry: false,
  });

  const productosById = useMemo(() => {
    const m = new Map<string, CatalogoItem>();
    (data?.productos ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Cargando catálogo…</p>
      </div>
    );
  }

  if (error || !data?.cliente) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Acceso no válido</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este enlace no existe o fue desactivado. Contacta a tu representante IMV.
          </p>
        </div>
      </div>
    );
  }

  const productos = data.productos ?? [];
  const porLab = productos.reduce<Record<string, CatalogoItem[]>>((acc, p) => {
    const k = p.laboratorio.nombre;
    (acc[k] ??= []).push(p);
    return acc;
  }, {});

  const cartItems = Object.entries(cart)
    .map(([id, qty]) => ({ producto: productosById.get(id), cantidad: qty }))
    .filter((x): x is { producto: CatalogoItem; cantidad: number } => !!x.producto);
  const cartCount = cartItems.reduce((s, i) => s + i.cantidad, 0);
  const cartSubtotal = cartItems.reduce((s, i) => s + i.cantidad * Number(i.producto.precio), 0);

  const setQty = (id: string, qty: number) => {
    setCart((c) => {
      const n = { ...c };
      if (qty <= 0) delete n[id];
      else n[id] = qty;
      return n;
    });
  };

  const exportPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 40;
    doc.setFontSize(16);
    doc.text("IMV Portal — Catálogo", margin, 50);
    doc.setFontSize(11);
    doc.text(data.cliente.nombre_comercial ?? data.cliente.razon_social, margin, 68);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(new Date().toLocaleDateString("es-MX"), margin, 82);
    doc.setTextColor(0);

    let startY = 100;
    Object.entries(porLab).forEach(([lab, items]) => {
      autoTable(doc, {
        startY,
        head: [[lab, "SKU", "Presentación", "Unidad", "Precio"]],
        body: items.map((p) => [
          p.nombre, p.sku ?? "", p.presentacion ?? "", p.unidad,
          `$${Number(p.precio).toFixed(2)}`,
        ]),
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [30, 30, 30], textColor: 255 },
        columnStyles: { 4: { halign: "right" } },
        margin: { left: margin, right: margin },
      });
      startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
    });

    const filename = `catalogo-${(data.cliente.nombre_comercial ?? data.cliente.razon_social)
      .toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
    doc.save(filename);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">IMV Portal</p>
            <h1 className="mt-1 text-2xl font-bold">
              {data.cliente.nombre_comercial ?? data.cliente.razon_social}
            </h1>
            <p className="text-sm text-muted-foreground">Catálogo personalizado</p>
          </div>
          <div className="flex items-center gap-2">
            {productos.length > 0 && (
              <button onClick={exportPDF} className="btn-secondary">PDF</button>
            )}
            <button
              onClick={() => setCheckoutOpen(true)}
              disabled={cartCount === 0}
              className="btn-primary disabled:opacity-50"
            >
              Carrito ({cartCount}) · ${cartSubtotal.toFixed(2)}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {productos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay productos disponibles.</p>
        ) : (
          Object.entries(porLab).map(([lab, items]) => (
            <section key={lab} className="mb-10">
              <h2 className="mb-4 text-lg font-semibold">{lab}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((p) => {
                  const qty = cart[p.id] ?? 0;
                  return (
                    <article
                      key={p.id}
                      className="overflow-hidden rounded-lg border border-border bg-card"
                    >
                      {p.imagen_url ? (
                        <img
                          src={p.imagen_url} alt={p.nombre} loading="lazy"
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                          Sin imagen
                        </div>
                      )}
                      <div className="p-4">
                        <h3 className="font-semibold leading-tight">{p.nombre}</h3>
                        {p.presentacion && (
                          <p className="text-xs text-muted-foreground">{p.presentacion}</p>
                        )}
                        <div className="mt-3 flex items-baseline justify-between">
                          <span className="text-lg font-bold tabular-nums">
                            ${Number(p.precio).toFixed(2)}
                          </span>
                          <span className="text-xs text-muted-foreground">/ {p.unidad}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          {qty === 0 ? (
                            <button
                              onClick={() => setQty(p.id, 1)}
                              className="btn-primary w-full text-sm"
                            >
                              Añadir
                            </button>
                          ) : (
                            <div className="flex w-full items-center justify-between rounded-md border border-border">
                              <button
                                onClick={() => setQty(p.id, qty - 1)}
                                className="px-3 py-1.5 text-lg leading-none hover:bg-muted"
                              >−</button>
                              <input
                                type="number" min={0} value={qty}
                                onChange={(e) => setQty(p.id, Math.max(0, Number(e.target.value) || 0))}
                                className="w-12 bg-transparent text-center text-sm tabular-nums outline-none"
                              />
                              <button
                                onClick={() => setQty(p.id, qty + 1)}
                                className="px-3 py-1.5 text-lg leading-none hover:bg-muted"
                              >+</button>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {checkoutOpen && (
        <CheckoutModal
          token={token}
          cliente={data.cliente}
          items={cartItems}
          subtotal={cartSubtotal}
          onClose={() => setCheckoutOpen(false)}
          onSubmitted={() => {
            setCart({});
            setCheckoutOpen(false);
          }}
          onChangeQty={setQty}
        />
      )}
    </main>
  );
}

function CheckoutModal({
  token, cliente, items, subtotal, onClose, onSubmitted, onChangeQty,
}: {
  token: string;
  cliente: CatalogoResponse["cliente"];
  items: { producto: CatalogoItem; cantidad: number }[];
  subtotal: number;
  onClose: () => void;
  onSubmitted: (folio: string) => void;
  onChangeQty: (id: string, qty: number) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [notas, setNotas] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    if (!nombre.trim()) { toast.error("Tu nombre es requerido"); return; }
    setSending(true);
    const { data, error } = await supabase.rpc("crear_pedido_para_token", {
      _token: token,
      _items: items.map((i) => ({ producto_id: i.producto.id, cantidad: i.cantidad })),
      _notas_cliente: notas.trim() || null,
      _contacto_nombre: nombre.trim(),
      _contacto_telefono: telefono.trim() || null,
      _contacto_email: email.trim() || null,
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    const folio = (row as { folio: string }).folio;
    setDone(folio);
    onSubmitted(folio);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <div className="my-8 w-full max-w-2xl rounded-lg border border-border bg-card p-6">
        {done ? (
          <div className="text-center">
            <h2 className="text-xl font-bold">¡Pedido enviado!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Folio <span className="font-mono font-semibold text-foreground">{done}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Te contactaremos para confirmar disponibilidad y entrega.
            </p>
            <button onClick={onClose} className="btn-primary mt-6">Cerrar</button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Resumen del pedido</h2>
              <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Cliente: {cliente.nombre_comercial ?? cliente.razon_social}
            </p>

            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 text-right">Cantidad</th>
                    <th className="px-3 py-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.producto.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <div className="font-medium">{i.producto.nombre}</div>
                        <div className="text-xs text-muted-foreground">
                          ${Number(i.producto.precio).toFixed(2)} / {i.producto.unidad}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number" min={0} value={i.cantidad}
                          onChange={(e) =>
                            onChangeQty(i.producto.id, Math.max(0, Number(e.target.value) || 0))
                          }
                          className="w-16 rounded border border-border bg-background px-1 py-0.5 text-right tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        ${(i.cantidad * Number(i.producto.precio)).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/50">
                    <td colSpan={2} className="px-3 py-2 text-right font-semibold">Subtotal</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      ${subtotal.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <form onSubmit={submit} className="mt-4 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm font-medium">Tu nombre *</label>
                <input required maxLength={120} value={nombre}
                  onChange={(e) => setNombre(e.target.value)} className="input mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Teléfono</label>
                <input maxLength={32} value={telefono}
                  onChange={(e) => setTelefono(e.target.value)} className="input mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <input type="email" maxLength={200} value={email}
                  onChange={(e) => setEmail(e.target.value)} className="input mt-1" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Notas</label>
                <textarea rows={2} maxLength={500} value={notas}
                  onChange={(e) => setNotas(e.target.value)} className="input mt-1" />
              </div>
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={sending || items.length === 0} className="btn-primary">
                  {sending ? "Enviando…" : "Enviar pedido"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
