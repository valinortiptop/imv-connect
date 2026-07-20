import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Lock, Unlock, Phone, HandCoins, ShieldCheck, FileText, Save, Mail, Sparkles, Loader2 } from "lucide-react";
import {
  enviarEstadoCuentaFn,
  analizarRiesgoClienteFn,
} from "@/lib/cobranza.functions";

export const Route = createFileRoute("/admin/credito-cobranza/clientes/$id")({
  component: Cliente360,
});

const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

function Cliente360() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: cliente } = useQuery({
    queryKey: ["cliente-360-info", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: kpis } = useQuery({
    queryKey: ["cliente-credito-kpi", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("v_cliente_credito_360" as any)
        .select("*")
        .eq("cliente_id", id)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: credito } = useQuery({
    queryKey: ["cliente-credito", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("cliente_credito" as any)
        .select("*")
        .eq("cliente_id", id)
        .maybeSingle();
      return data as any;
    },
  });

  const guardarCredito = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from("cliente_credito" as any).upsert({
        cliente_id: id,
        ...payload,
        updated_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Datos de crédito actualizados");
      qc.invalidateQueries({ queryKey: ["cliente-credito", id] });
      qc.invalidateQueries({ queryKey: ["cliente-credito-kpi", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/admin/credito-cobranza/cartera" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Cartera
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{cliente?.nombre_comercial || cliente?.razon_social}</h2>
          {cliente?.nombre_comercial && <p className="text-sm text-muted-foreground">{cliente.razon_social}</p>}
          <p className="text-xs font-mono text-muted-foreground">RFC: {cliente?.rfc || "—"}</p>
        </div>
        {kpis?.bloqueado ? (
          <Badge className="bg-red-500/15 text-red-600 border-red-500/30 border gap-1"><Lock className="h-3 w-3" /> Bloqueado</Badge>
        ) : (
          <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 border gap-1"><Unlock className="h-3 w-3" /> Activo</Badge>
        )}
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Saldo total" value={mxn(Number(kpis?.saldo_total || 0))} />
        <Kpi title="Vencido" value={mxn(Number(kpis?.saldo_vencido || 0))} tone={Number(kpis?.saldo_vencido || 0) > 0 ? "text-red-500" : ""} />
        <Kpi title="Utilización" value={kpis?.utilizacion_pct != null ? `${kpis.utilizacion_pct}%` : "—"} />
        <Kpi title="Días pago prom." value={String(kpis?.dias_pago_prom || 0)} />
      </div>

      <RiesgoIAPanel clienteId={id} />

      <Tabs defaultValue="credito" className="w-full">
        <TabsList>
          <TabsTrigger value="credito"><ShieldCheck className="h-3.5 w-3.5 mr-1" />Crédito</TabsTrigger>
          <TabsTrigger value="facturas"><FileText className="h-3.5 w-3.5 mr-1" />Facturas</TabsTrigger>
          <TabsTrigger value="gestiones"><Phone className="h-3.5 w-3.5 mr-1" />Gestiones</TabsTrigger>
          <TabsTrigger value="promesas"><HandCoins className="h-3.5 w-3.5 mr-1" />Promesas</TabsTrigger>
          <TabsTrigger value="autorizaciones">Autorizaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="credito">
          <CreditoForm initial={credito} clienteId={id} onSave={(p) => guardarCredito.mutate(p)} pending={guardarCredito.isPending} />
        </TabsContent>

        <TabsContent value="facturas"><FacturasTab clienteId={id} /></TabsContent>
        <TabsContent value="gestiones"><GestionesTab clienteId={id} /></TabsContent>
        <TabsContent value="promesas"><PromesasTab clienteId={id} /></TabsContent>
        <TabsContent value="autorizaciones"><AutorizacionesTab clienteId={id} /></TabsContent>
      </Tabs>
    </div>
  );
}

function RiesgoIAPanel({ clienteId }: { clienteId: string }) {
  const analizar = useServerFn(analizarRiesgoClienteFn);
  const enviarEdo = useServerFn(enviarEstadoCuentaFn);
  const [loading, setLoading] = useState(false);
  const [enviandoEdo, setEnviandoEdo] = useState(false);
  const [resultado, setResultado] = useState<{ score: number; nivel: string; recomendaciones: string } | null>(null);

  const color = resultado ? (
    resultado.nivel === "critico" ? "text-red-500 border-red-500/40 bg-red-500/10" :
    resultado.nivel === "alto" ? "text-orange-500 border-orange-500/40 bg-orange-500/10" :
    resultado.nivel === "medio" ? "text-yellow-500 border-yellow-500/40 bg-yellow-500/10" :
    "text-emerald-500 border-emerald-500/40 bg-emerald-500/10"
  ) : "";

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-sm flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> Riesgo IA & comunicaciones</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1" disabled={enviandoEdo}
            onClick={async () => {
              setEnviandoEdo(true);
              try {
                const r = await enviarEdo({ data: { clienteId } });
                toast.success(`Estado de cuenta enviado a ${r.destinatario}`);
              } catch (e) { toast.error((e as Error).message); }
              finally { setEnviandoEdo(false); }
            }}>
            {enviandoEdo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />} Enviar estado de cuenta
          </Button>
          <Button size="sm" className="gap-1" disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                const r = await analizar({ data: { clienteId } });
                setResultado(r);
                toast.success(`Análisis completado: ${r.nivel} (${r.score}/100)`);
              } catch (e) { toast.error((e as Error).message); }
              finally { setLoading(false); }
            }}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Analizar riesgo
          </Button>
        </div>
      </div>
      {resultado && (
        <div className="space-y-2">
          <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold capitalize ${color}`}>
            Riesgo {resultado.nivel} · {resultado.score}/100
          </div>
          <div className="whitespace-pre-line text-xs bg-muted/40 rounded-md p-3 leading-relaxed">
            {resultado.recomendaciones || "Sin recomendaciones."}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ title, value, tone }: { title: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className={`mt-1 text-lg font-semibold font-mono ${tone || ""}`}>{value}</div>
    </div>
  );
}

/* ------- Crédito Form ------- */
function CreditoForm({ initial, onSave, pending }: { initial: any; onSave: (p: any) => void; pending: boolean }) {
  const [limite, setLimite] = useState<string>(initial?.limite_credito?.toString() || "0");
  const [dias, setDias] = useState<string>(initial?.dias_credito?.toString() || "30");
  const [condicion, setCondicion] = useState(initial?.condicion_pago || "");
  const [bloqueado, setBloqueado] = useState<boolean>(!!initial?.bloqueado);
  const [motivoBloqueo, setMotivoBloqueo] = useState(initial?.motivo_bloqueo || "");
  const [riesgoManual, setRiesgoManual] = useState<string>(initial?.riesgo_manual || "auto");
  const [notas, setNotas] = useState(initial?.notas || "");

  return (
    <div className="rounded-lg border border-border p-4 space-y-3 max-w-2xl">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Límite de crédito</label>
          <Input type="number" value={limite} onChange={(e) => setLimite(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Días de crédito</label>
          <Input type="number" value={dias} onChange={(e) => setDias(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Condición de pago</label>
          <Input value={condicion} onChange={(e) => setCondicion(e.target.value)} placeholder="Ej. 30 días netos" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Riesgo manual</label>
          <Select value={riesgoManual} onValueChange={setRiesgoManual}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automático</SelectItem>
              <SelectItem value="bajo">Bajo</SelectItem>
              <SelectItem value="medio">Medio</SelectItem>
              <SelectItem value="alto">Alto</SelectItem>
              <SelectItem value="critico">Crítico</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input id="bloq" type="checkbox" checked={bloqueado} onChange={(e) => setBloqueado(e.target.checked)} />
          <label htmlFor="bloq" className="text-sm font-medium">Bloquear cliente</label>
        </div>
        {bloqueado && (
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">Motivo del bloqueo</label>
            <Input value={motivoBloqueo} onChange={(e) => setMotivoBloqueo(e.target.value)} />
          </div>
        )}
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Notas</label>
          <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>
      <Button disabled={pending} className="gap-2" onClick={() => onSave({
        limite_credito: Number(limite) || 0,
        dias_credito: Number(dias) || 30,
        condicion_pago: condicion || null,
        bloqueado,
        motivo_bloqueo: bloqueado ? motivoBloqueo : null,
        riesgo_manual: riesgoManual === "auto" ? null : riesgoManual,
        notas: notas || null,
      })}>
        <Save className="h-4 w-4" /> Guardar
      </Button>
    </div>
  );
}

/* ------- Facturas Tab ------- */
function FacturasTab({ clienteId }: { clienteId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["cliente-facturas", clienteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("facturas")
        .select("id, folio, fecha_emision, fecha_vencimiento, total, pagado, saldo, estado")
        .eq("cliente_id", clienteId)
        .order("fecha_emision", { ascending: false })
        .limit(100);
      return (data ?? []) as any[];
    },
  });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="text-left px-2 py-2">Folio</th>
            <th className="text-left px-2 py-2">Emisión</th>
            <th className="text-left px-2 py-2">Vence</th>
            <th className="text-right px-2 py-2">Total</th>
            <th className="text-right px-2 py-2">Saldo</th>
            <th className="text-center px-2 py-2">Estado</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground text-xs">Sin facturas.</td></tr>
          ) : data.map((f: any) => {
            const vencida = f.fecha_vencimiento < today && Number(f.saldo) > 0;
            return (
              <tr key={f.id} className="border-t border-border">
                <td className="px-2 py-1.5 font-mono text-xs">{f.folio}</td>
                <td className="px-2 py-1.5 text-xs">{f.fecha_emision}</td>
                <td className={`px-2 py-1.5 text-xs ${vencida ? "text-red-500 font-semibold" : ""}`}>{f.fecha_vencimiento}</td>
                <td className="px-2 py-1.5 text-right font-mono">{mxn(Number(f.total))}</td>
                <td className="px-2 py-1.5 text-right font-mono">{mxn(Number(f.saldo || 0))}</td>
                <td className="px-2 py-1.5 text-center"><Badge variant="outline" className="capitalize">{f.estado}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------- Gestiones Tab ------- */
function GestionesTab({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tipo, setTipo] = useState("llamada");
  const [resultado, setResultado] = useState("contactado");
  const [notas, setNotas] = useState("");
  const [monto, setMonto] = useState("");
  const [next, setNext] = useState("");

  const { data = [] } = useQuery({
    queryKey: ["cliente-gestiones", clienteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("cobranza_gestiones" as any)
        .select("*")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as any[];
    },
  });

  const crear = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cobranza_gestiones" as any).insert({
        cliente_id: clienteId,
        tipo, resultado,
        notas: notas || null,
        monto_comprometido: monto ? Number(monto) : null,
        next_action_at: next ? new Date(next).toISOString() : null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gestión registrada");
      qc.invalidateQueries({ queryKey: ["cliente-gestiones", clienteId] });
      setNotas(""); setMonto(""); setNext("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-border p-3 space-y-2">
        <h3 className="font-medium text-sm">Nueva gestión</h3>
        <div className="grid grid-cols-2 gap-2">
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["llamada","correo","whatsapp","sms","visita","otro"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={resultado} onValueChange={setResultado}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["contactado","no_contesta","buzon","promesa_pago","disputa","pago_realizado","sin_respuesta","otro"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" placeholder="Monto comprometido" value={monto} onChange={(e) => setMonto(e.target.value)} />
          <Input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <Textarea rows={2} placeholder="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
        <Button size="sm" disabled={crear.isPending} onClick={() => crear.mutate()}>Registrar gestión</Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr><th className="text-left px-2 py-1.5">Fecha</th><th className="text-left px-2 py-1.5">Tipo</th><th className="text-left px-2 py-1.5">Resultado</th></tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={3} className="px-2 py-4 text-center text-muted-foreground text-xs">Sin gestiones.</td></tr>
            ) : data.map((g: any) => (
              <tr key={g.id} className="border-t border-border align-top">
                <td className="px-2 py-1.5 text-xs whitespace-nowrap">{new Date(g.created_at).toLocaleDateString("es-MX")}</td>
                <td className="px-2 py-1.5 text-xs capitalize">{g.tipo}</td>
                <td className="px-2 py-1.5 text-xs">
                  <div className="capitalize">{g.resultado || "—"}</div>
                  {g.notas && <div className="text-muted-foreground line-clamp-2">{g.notas}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------- Promesas Tab ------- */
function PromesasTab({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [facturaId, setFacturaId] = useState<string>("ninguna");
  const [notas, setNotas] = useState("");

  const { data: facturas = [] } = useQuery({
    queryKey: ["cliente-facturas-abiertas", clienteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("facturas")
        .select("id, folio, saldo")
        .eq("cliente_id", clienteId)
        .in("estado", ["emitida", "parcial"])
        .limit(50);
      return (data ?? []) as any[];
    },
  });

  const { data = [] } = useQuery({
    queryKey: ["cliente-promesas", clienteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("cobranza_promesas_pago" as any)
        .select("*, facturas(folio)")
        .eq("cliente_id", clienteId)
        .order("fecha_promesa", { ascending: false })
        .limit(100);
      return (data ?? []) as any[];
    },
  });

  const crear = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cobranza_promesas_pago" as any).insert({
        cliente_id: clienteId,
        factura_id: facturaId === "ninguna" ? null : facturaId,
        monto: Number(monto),
        fecha_promesa: fecha,
        notas: notas || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Promesa registrada");
      qc.invalidateQueries({ queryKey: ["cliente-promesas", clienteId] });
      setOpen(false); setMonto(""); setFecha(""); setNotas(""); setFacturaId("ninguna");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button size="sm">Nueva promesa</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva promesa de pago</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Monto</label>
              <Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fecha compromiso</label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Factura (opcional)</label>
              <Select value={facturaId} onValueChange={setFacturaId}>
                <SelectTrigger><SelectValue placeholder="Sin factura específica" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguna">Sin factura específica</SelectItem>
                  {facturas.map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.folio} · {mxn(Number(f.saldo || 0))}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Notas</label>
              <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!monto || !fecha || crear.isPending} onClick={() => crear.mutate()}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-2 py-1.5">Fecha</th>
              <th className="text-left px-2 py-1.5">Factura</th>
              <th className="text-right px-2 py-1.5">Monto</th>
              <th className="text-center px-2 py-1.5">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={4} className="px-2 py-4 text-center text-muted-foreground text-xs">Sin promesas.</td></tr>
            ) : data.map((p: any) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-2 py-1.5 text-xs">{p.fecha_promesa}</td>
                <td className="px-2 py-1.5 font-mono text-xs">{p.facturas?.folio || "—"}</td>
                <td className="px-2 py-1.5 text-right font-mono">{mxn(Number(p.monto))}</td>
                <td className="px-2 py-1.5 text-center"><Badge variant="outline" className="capitalize">{p.estado}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------- Autorizaciones Tab ------- */
function AutorizacionesTab({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState("desbloqueo");
  const [monto, setMonto] = useState("");
  const [dias, setDias] = useState("");
  const [motivo, setMotivo] = useState("");

  const { data = [] } = useQuery({
    queryKey: ["cliente-autorizaciones", clienteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("credito_autorizaciones" as any)
        .select("*")
        .eq("cliente_id", clienteId)
        .order("solicitado_at", { ascending: false })
        .limit(50);
      return (data ?? []) as any[];
    },
  });

  const solicitar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("credito_autorizaciones" as any).insert({
        cliente_id: clienteId,
        tipo,
        monto: monto ? Number(monto) : null,
        dias: dias ? Number(dias) : null,
        motivo,
        solicitado_por: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitud registrada");
      qc.invalidateQueries({ queryKey: ["cliente-autorizaciones", clienteId] });
      setOpen(false); setMonto(""); setDias(""); setMotivo("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button size="sm">Nueva solicitud</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Solicitar autorización</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Tipo</label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desbloqueo">Desbloqueo</SelectItem>
                  <SelectItem value="incremento_limite">Incremento de límite</SelectItem>
                  <SelectItem value="excepcion_credito">Excepción de crédito</SelectItem>
                  <SelectItem value="ampliacion_plazo">Ampliación de plazo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Monto (opcional)</label>
              <Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Días (opcional)</label>
              <Input type="number" value={dias} onChange={(e) => setDias(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Motivo</label>
              <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!motivo || solicitar.isPending} onClick={() => solicitar.mutate()}>Enviar solicitud</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-2 py-1.5">Fecha</th>
              <th className="text-left px-2 py-1.5">Tipo</th>
              <th className="text-right px-2 py-1.5">Monto/Días</th>
              <th className="text-center px-2 py-1.5">Estado</th>
              <th className="text-left px-2 py-1.5">Motivo/Respuesta</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={5} className="px-2 py-4 text-center text-muted-foreground text-xs">Sin solicitudes.</td></tr>
            ) : data.map((a: any) => (
              <tr key={a.id} className="border-t border-border align-top">
                <td className="px-2 py-1.5 text-xs whitespace-nowrap">{new Date(a.solicitado_at).toLocaleDateString("es-MX")}</td>
                <td className="px-2 py-1.5 text-xs capitalize">{String(a.tipo).replace(/_/g, " ")}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs">
                  {a.monto ? mxn(Number(a.monto)) : ""}{a.dias ? ` · ${a.dias}d` : ""}
                </td>
                <td className="px-2 py-1.5 text-center"><Badge variant="outline" className="capitalize">{a.estado}</Badge></td>
                <td className="px-2 py-1.5 text-xs">
                  <div>{a.motivo}</div>
                  {a.respuesta && <div className="text-muted-foreground italic">"{a.respuesta}"</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
