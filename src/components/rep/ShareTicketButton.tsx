import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Share2, Printer, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getShareTicketFn } from "@/lib/rep-field.functions";

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

function digitsOnly(v?: string | null) {
  return (v ?? "").replace(/\D+/g, "");
}

function buildWhatsappText(t: any) {
  const lines: string[] = [];
  lines.push(`*${t.title}*`);
  lines.push(`Cliente: ${t.client.name}`);
  if (t.rep) lines.push(`Atendió: ${t.rep}`);
  lines.push(`Fecha: ${new Date(t.date).toLocaleDateString("es-MX")}`);
  if (t.delivery_date) lines.push(`Entrega: ${t.delivery_date}`);
  lines.push("");
  for (const it of t.items) {
    lines.push(`• ${it.qty} x ${it.name}${it.sku ? ` (${it.sku})` : ""} — ${fmtMXN(it.amount)}`);
  }
  lines.push("");
  lines.push(`Subtotal: ${fmtMXN(t.subtotal)}`);
  if (t.iva) lines.push(`IVA: ${fmtMXN(t.iva)}`);
  lines.push(`*Total: ${fmtMXN(t.total)}*`);
  if (t.notes) lines.push(`\nNotas: ${t.notes}`);
  return lines.join("\n");
}

export default function ShareTicketButton({
  kind,
  id,
  size = "sm",
  variant = "outline",
  label = "Compartir",
}: {
  kind: "pedido" | "cotizacion" | "pago";
  id: string;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
  label?: string;
}) {
  const fetchTicket = useServerFn(getShareTicketFn);
  const [open, setOpen] = useState(false);
  const [ticket, setTicket] = useState<any>(null);

  const load = useMutation({
    mutationFn: () => fetchTicket({ data: { kind, id } }),
    onSuccess: (t) => {
      setTicket(t);
      setOpen(true);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const openWhatsapp = () => {
    if (!ticket) return;
    const text = encodeURIComponent(buildWhatsappText(ticket));
    const phone = digitsOnly(ticket.client.phone);
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const printTicket = () => {
    const el = document.getElementById("printable-ticket");
    if (!el) return;
    const w = window.open("", "_blank", "width=380,height=640");
    if (!w) return;
    w.document.write(`<html><head><title>${ticket.title}</title>
      <style>
        body{font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;padding:8px;color:#111}
        h1{font-size:14px;margin:0 0 4px}
        table{width:100%;border-collapse:collapse}
        td{padding:2px 0;vertical-align:top}
        .r{text-align:right}
        .muted{color:#666;font-size:11px}
        hr{border:none;border-top:1px dashed #999;margin:6px 0}
      </style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <>
      <Button
        size={size}
        variant={variant}
        onClick={() => (ticket ? setOpen(true) : load.mutate())}
        disabled={load.isPending}
      >
        {load.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Share2 className="mr-1 h-3 w-3" />}
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{ticket?.title}</DialogTitle>
          </DialogHeader>
          {ticket && (
            <div id="printable-ticket" className="space-y-2 text-sm">
              <div className="muted text-xs text-muted-foreground">
                {new Date(ticket.date).toLocaleDateString("es-MX")}{" "}
                {ticket.delivery_date ? `· Entrega ${ticket.delivery_date}` : ""}
              </div>
              <div>
                <strong>Cliente:</strong> {ticket.client.name}
              </div>
              {ticket.rep && (
                <div className="muted text-xs text-muted-foreground">Atendió: {ticket.rep}</div>
              )}
              <hr />
              <table>
                <tbody>
                  {ticket.items.map((it: any, i: number) => (
                    <tr key={i}>
                      <td>
                        {it.qty} × {it.name}
                        {it.sku ? <span className="muted"> ({it.sku})</span> : null}
                      </td>
                      <td className="r">{fmtMXN(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <hr />
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{fmtMXN(ticket.subtotal)}</span>
              </div>
              {ticket.iva > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>IVA</span>
                  <span>{fmtMXN(ticket.iva)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{fmtMXN(ticket.total)}</span>
              </div>
              {ticket.notes && (
                <div className="rounded bg-muted/50 p-2 text-xs">{ticket.notes}</div>
              )}
            </div>
          )}
          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button variant="outline" size="sm" onClick={printTicket}>
              <Printer className="mr-1 h-3 w-3" /> Imprimir
            </Button>
            <Button size="sm" onClick={openWhatsapp}>
              <MessageCircle className="mr-1 h-3 w-3" /> WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
