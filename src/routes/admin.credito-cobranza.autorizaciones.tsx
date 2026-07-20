import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldCheck, Check, X, Plus } from "lucide-react";
import { solicitarAutorizacionFn, resolverAutorizacionFn } from "@/lib/cobranza-fase5.functions";

export const Route = createFileRoute("/admin/credito-cobranza/autorizaciones")({
  component: AutorizacionesPage,
});

function AutorizacionesPage() {
  const qc = useQueryClient();
  const [estado, setEstado] = useState<string>("solicitada");
  const [open, setOpen] = useState(false);
  const solicitar = useServerFn(solicitarAutorizacionFn);
  const resolverSrv = useServerFn(resolverAutorizacionFn);

  const { data = [] } = useQuery({
    queryKey: ["autorizaciones", estado],
    queryFn: async () => {
      let q = supabase
        .from("credito_autorizaciones" as any)
        .select("id, cliente_id, tipo, estado, monto, dias, motivo, respuesta, solicitado_at, resuelto_at, clientes(razon_social, nombre_comercial)")
        .order("solicitado_at", { ascending: false })
        .limit(300);
      if (estado !== "todas") q = q.eq("estado", estado);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const resolver = useMutation({
    mutationFn: (args: { id: string; aprobar: boolean; respuesta: string }) =>
      resolverSrv({ data: { autorizacionId: args.id, aprobar: args.aprobar, respuesta: args.respuesta } }),
    onSuccess: () => {
      toast.success("Autorización resuelta");
      qc.invalidateQueries({ queryKey: ["autorizaciones"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Autorizaciones de crédito</h2>
        <div className="flex gap-2">
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="solicitada">Solicitadas</SelectItem>
              <SelectItem value="aprobada">Aprobadas</SelectItem>
              <SelectItem value="rechazada">Rechazadas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Solicitar</Button>
            </DialogTrigger>
            <SolicitarDialog onSubmit={async (payload) => {
              try {
                await solicitar({ data: payload });
                toast.success("Solicitud enviada");
                setOpen(false);
                qc.invalidateQueries({ queryKey: ["autorizaciones"] });
              } catch (e) { toast.error((e as Error).message); }
            }} />
          </Dialog>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-2 py-2">Fecha</th>
              <th className="text-left px-2 py-2">Cliente</th>
              <th className="text-left px-2 py-2">Tipo</th>
              <th className="text-right px-2 py-2">Monto / Días</th>
              <th className="text-left px-2 py-2">Motivo</th>
              <th className="text-center px-2 py-2">Estado</th>
              <th className="w-40"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Sin solicitudes.</td></tr>
            ) : data.map((a: any) => (
              <tr key={a.id} className="border-t border-border align-top">
                <td className="px-2 py-1.5 text-xs whitespace-nowrap">{new Date(a.solicitado_at).toLocaleDateString("es-MX")}</td>
                <td className="px-2 py-1.5">
                  <Link to="/admin/credito-cobranza/clientes/$id" params={{ id: a.cliente_id }} className="hover:underline">
                    {a.clientes?.nombre_comercial || a.clientes?.razon_social}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-xs capitalize">{String(a.tipo).replace(/_/g, " ")}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs">
                  {a.monto ? `$${Number(a.monto).toLocaleString("es-MX")}` : ""}
                  {a.dias ? ` · ${a.dias}d` : ""}
                </td>
                <td className="px-2 py-1.5 text-xs max-w-md">{a.motivo}</td>
                <td className="px-2 py-1.5 text-center">
                  <Badge variant="outline" className="capitalize">{a.estado}</Badge>
                </td>
                <td className="px-2 py-1.5 text-right">
                  {a.estado === "solicitada" && (
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" className="h-7 gap-1"
                        onClick={() => {
                          const r = prompt("Respuesta / notas:", "");
                          if (r !== null) resolver.mutate({ id: a.id, aprobar: true, respuesta: r });
                        }}>
                        <Check className="h-3 w-3 text-emerald-500" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1"
                        onClick={() => {
                          const r = prompt("Motivo del rechazo:", "");
                          if (r !== null) resolver.mutate({ id: a.id, aprobar: false, respuesta: r });
                        }}>
                        <X className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  )}
                  {a.respuesta && a.estado !== "solicitada" && (
                    <div className="text-xs text-muted-foreground italic">"{a.respuesta}"</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SolicitarDialog({ onSubmit }: { onSubmit: (p: any) => Promise<void> }) {
  const [clienteId, setClienteId] = useState<string>("");
  const [tipo, setTipo] = useState<"desbloqueo" | "incremento_limite" | "excepcion" | "ampliacion_dias">("desbloqueo");
  const [monto, setMonto] = useState<string>("");
  const [dias, setDias] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("clientes").select("id, razon_social, nombre_comercial").order("nombre_comercial").limit(500);
      return (data ?? []) as any[];
    },
  });

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Solicitar autorización</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Cliente</Label>
          <Select value={clienteId} onValueChange={setClienteId}>
            <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
            <SelectContent>
              {clientes.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.nombre_comercial || c.razon_social}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tipo</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="desbloqueo">Desbloqueo</SelectItem>
              <SelectItem value="incremento_limite">Incremento de límite</SelectItem>
              <SelectItem value="ampliacion_dias">Ampliación de días</SelectItem>
              <SelectItem value="excepcion">Excepción / venta bloqueada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(tipo === "incremento_limite" || tipo === "excepcion") && (
          <div>
            <Label>Monto</Label>
            <Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>
        )}
        {tipo === "ampliacion_dias" && (
          <div>
            <Label>Nuevos días de crédito</Label>
            <Input type="number" value={dias} onChange={(e) => setDias(e.target.value)} />
          </div>
        )}
        <div>
          <Label>Motivo</Label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Justificación…" />
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!clienteId || !motivo || busy} onClick={async () => {
          setBusy(true);
          try {
            await onSubmit({
              clienteId,
              tipo,
              motivo,
              monto: monto ? Number(monto) : null,
              dias: dias ? Number(dias) : null,
            });
          } finally { setBusy(false); }
        }}>Enviar solicitud</Button>
      </DialogFooter>
    </DialogContent>
  );
}
