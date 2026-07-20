import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Phone, Plus } from "lucide-react";

export const Route = createFileRoute("/admin/credito-cobranza/gestiones")({
  component: GestionesPage,
});

type Gestion = {
  id: string;
  cliente_id: string;
  factura_id: string | null;
  tipo: string;
  resultado: string | null;
  monto_comprometido: number | null;
  notas: string | null;
  next_action_at: string | null;
  created_at: string;
  clientes?: { razon_social: string; nombre_comercial: string | null } | null;
};

function GestionesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const { data: pendientes = [] } = useQuery({
    queryKey: ["cobranza-cola"],
    queryFn: async () => {
      // Prioritized queue: overdue + no recent gestion + high risk first
      const { data, error } = await supabase
        .from("v_cliente_credito_360" as any)
        .select("cliente_id, razon_social, nombre_comercial, saldo_vencido, facturas_vencidas, riesgo_calculado, ultima_gestion_at, promesas_pendientes")
        .gt("saldo_vencido", 0)
        .order("saldo_vencido", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: recientes = [] } = useQuery({
    queryKey: ["cobranza-gestiones-recientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cobranza_gestiones" as any)
        .select("id, cliente_id, factura_id, tipo, resultado, monto_comprometido, notas, next_action_at, created_at, clientes(razon_social, nombre_comercial)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Gestion[];
    },
  });

  const nueva = useMutation({
    mutationFn: async (payload: {
      cliente_id: string; tipo: string; resultado: string | null;
      notas: string; monto: number | null; next_action_at: string | null;
    }) => {
      const { error } = await supabase.from("cobranza_gestiones" as any).insert({
        cliente_id: payload.cliente_id,
        tipo: payload.tipo,
        resultado: payload.resultado,
        monto_comprometido: payload.monto,
        notas: payload.notas,
        next_action_at: payload.next_action_at,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gestión registrada");
      qc.invalidateQueries({ queryKey: ["cobranza-gestiones-recientes"] });
      qc.invalidateQueries({ queryKey: ["cobranza-cola"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><Phone className="h-4 w-4 text-primary" /> Cola de trabajo</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1"><Plus className="h-3.5 w-3.5" /> Nueva gestión</Button>
            </DialogTrigger>
            <NuevaGestionDialog onSubmit={(p) => nueva.mutate(p)} pending={nueva.isPending} />
          </Dialog>
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr><th className="text-left px-2 py-1.5">Cliente</th><th className="text-right px-2 py-1.5">Vencido</th><th className="text-center px-2 py-1.5">Riesgo</th><th></th></tr>
            </thead>
            <tbody>
              {pendientes.length === 0 ? (
                <tr><td colSpan={4} className="px-2 py-4 text-center text-muted-foreground text-xs">Sin pendientes 🎉</td></tr>
              ) : pendientes.map((p: any) => (
                <tr key={p.cliente_id} className="border-t border-border">
                  <td className="px-2 py-1.5 truncate max-w-[180px]">{p.nombre_comercial || p.razon_social}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-red-500 text-xs">
                    ${Number(p.saldo_vencido).toLocaleString("es-MX", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-2 py-1.5 text-center text-xs capitalize">{p.riesgo_calculado}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Link to="/admin/credito-cobranza/clientes/$id" params={{ id: p.cliente_id }} className="text-primary text-xs hover:underline">
                      Gestionar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Bitácora reciente</h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr><th className="text-left px-2 py-1.5">Fecha</th><th className="text-left px-2 py-1.5">Cliente</th><th className="text-left px-2 py-1.5">Tipo / Resultado</th></tr>
            </thead>
            <tbody>
              {recientes.length === 0 ? (
                <tr><td colSpan={3} className="px-2 py-4 text-center text-muted-foreground text-xs">Aún no hay gestiones.</td></tr>
              ) : recientes.map((g) => (
                <tr key={g.id} className="border-t border-border align-top">
                  <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                    {new Date(g.created_at).toLocaleDateString("es-MX")}
                  </td>
                  <td className="px-2 py-1.5">
                    <Link to="/admin/credito-cobranza/clientes/$id" params={{ id: g.cliente_id }} className="hover:underline text-xs">
                      {g.clientes?.nombre_comercial || g.clientes?.razon_social || "—"}
                    </Link>
                    {g.notas && <div className="text-xs text-muted-foreground line-clamp-2">{g.notas}</div>}
                  </td>
                  <td className="px-2 py-1.5 text-xs capitalize">
                    <div>{g.tipo}</div>
                    <div className="text-muted-foreground">{g.resultado || "—"}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function NuevaGestionDialog({
  onSubmit, pending,
}: {
  onSubmit: (p: { cliente_id: string; tipo: string; resultado: string | null; notas: string; monto: number | null; next_action_at: string | null }) => void;
  pending: boolean;
}) {
  const [cliente_id, setCliente] = useState("");
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("llamada");
  const [resultado, setResultado] = useState<string>("contactado");
  const [notas, setNotas] = useState("");
  const [monto, setMonto] = useState<string>("");
  const [next, setNext] = useState<string>("");

  const { data: clientes = [] } = useQuery({
    queryKey: ["cobranza-clientes-search", q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("clientes")
        .select("id, razon_social, nombre_comercial")
        .or(`razon_social.ilike.%${q}%,nombre_comercial.ilike.%${q}%`)
        .limit(10);
      return (data ?? []) as any[];
    },
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Nueva gestión de cobranza</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Cliente</label>
          <Input placeholder="Buscar cliente…" value={q} onChange={(e) => { setQ(e.target.value); setCliente(""); }} />
          {clientes.length > 0 && !cliente_id && (
            <div className="mt-1 max-h-32 overflow-y-auto rounded border border-border">
              {clientes.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => { setCliente(c.id); setQ(c.nombre_comercial || c.razon_social); }}
                  className="w-full text-left text-xs px-2 py-1 hover:bg-muted"
                >
                  {c.nombre_comercial || c.razon_social}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Tipo</label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["llamada","correo","whatsapp","sms","visita","otro"].map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Resultado</label>
            <Select value={resultado} onValueChange={setResultado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["contactado","no_contesta","buzon","promesa_pago","disputa","pago_realizado","sin_respuesta","otro"].map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Monto comprometido (opcional)</label>
            <Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Próximo seguimiento</label>
            <Input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Notas</label>
          <Textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!cliente_id || pending}
          onClick={() => onSubmit({
            cliente_id, tipo, resultado,
            notas, monto: monto ? Number(monto) : null,
            next_action_at: next ? new Date(next).toISOString() : null,
          })}
        >Guardar</Button>
      </DialogFooter>
    </DialogContent>
  );
}
