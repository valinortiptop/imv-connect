import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Save, Send, XCircle, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/contabilidad/polizas/$id")({
  head: () => ({
    meta: [{ title: "Póliza — Contabilidad" }, { name: "robots", content: "noindex" }],
  }),
  component: PolizaEditor,
});

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

type Poliza = {
  id: string;
  empresa_id: string;
  periodo_id: string | null;
  tipo: "ingreso" | "egreso" | "diario";
  folio: string;
  fecha: string;
  concepto: string;
  estado: "borrador" | "asentada" | "cancelada";
  total_cargos: number;
  total_abonos: number;
  origen: string | null;
  origen_id: string | null;
};

type Mov = {
  id: string;
  poliza_id: string;
  cuenta_id: string;
  cargo: number;
  abono: number;
  concepto: string | null;
  uuid_cfdi: string | null;
  orden: number;
};

type Cuenta = { id: string; codigo: string; nombre: string; permite_movimientos: boolean };

function PolizaEditor() {
  const { id } = useParams({ from: "/admin/contabilidad/polizas/$id" });
  const qc = useQueryClient();

  const { data: poliza, isLoading } = useQuery({
    queryKey: ["poliza", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("polizas" as any).select("*").eq("id", id).single();
      if (error) throw error;
      return data as unknown as Poliza;
    },
  });

  const { data: movs = [], refetch: refetchMovs } = useQuery({
    queryKey: ["poliza-movs", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("poliza_movimientos" as any)
        .select("*")
        .eq("poliza_id", id)
        .order("orden");
      if (error) throw error;
      return (data ?? []) as unknown as Mov[];
    },
  });

  const { data: cuentas = [] } = useQuery({
    queryKey: ["cuentas-para-poliza", poliza?.empresa_id],
    enabled: !!poliza?.empresa_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cuentas_contables" as any)
        .select("id, codigo, nombre, permite_movimientos")
        .eq("empresa_id", poliza!.empresa_id)
        .eq("activa", true)
        .eq("permite_movimientos", true)
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as unknown as Cuenta[];
    },
  });

  const [fecha, setFecha] = useState<string>("");
  const [concepto, setConcepto] = useState<string>("");
  useEffect(() => {
    if (poliza) { setFecha(poliza.fecha); setConcepto(poliza.concepto ?? ""); }
  }, [poliza?.id]);

  const totalCargos = useMemo(() => movs.reduce((s, m) => s + Number(m.cargo || 0), 0), [movs]);
  const totalAbonos = useMemo(() => movs.reduce((s, m) => s + Number(m.abono || 0), 0), [movs]);
  const diff = totalCargos - totalAbonos;
  const cuadra = Math.abs(diff) < 0.005 && totalCargos > 0;

  const editable = poliza?.estado === "borrador";

  const saveHeader = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("polizas" as any)
        .update({ fecha, concepto })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Datos guardados"); qc.invalidateQueries({ queryKey: ["poliza", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addRow = useMutation({
    mutationFn: async () => {
      const orden = (movs[movs.length - 1]?.orden ?? -1) + 1;
      const defCuenta = cuentas[0]?.id;
      if (!defCuenta) throw new Error("Necesitas cuentas activas con 'permite movimientos'");
      const { error } = await supabase.from("poliza_movimientos" as any).insert({
        poliza_id: id, cuenta_id: defCuenta, cargo: 0, abono: 0, orden,
      });
      if (error) throw error;
    },
    onSuccess: () => { refetchMovs(); qc.invalidateQueries({ queryKey: ["poliza", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRow = useMutation({
    mutationFn: async (m: Partial<Mov> & { id: string }) => {
      const patch: any = { ...m };
      delete patch.id;
      const { error } = await supabase.from("poliza_movimientos" as any).update(patch).eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => { refetchMovs(); qc.invalidateQueries({ queryKey: ["poliza", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRow = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from("poliza_movimientos" as any).delete().eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => { refetchMovs(); qc.invalidateQueries({ queryKey: ["poliza", id] }); },
  });

  const asentar = useMutation({
    mutationFn: async () => {
      if (!cuadra) throw new Error("La póliza no cuadra");
      const { error } = await supabase.from("polizas" as any).update({ estado: "asentada" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Póliza asentada"); qc.invalidateQueries({ queryKey: ["poliza", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("polizas" as any).update({ estado: "cancelada" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Póliza cancelada"); qc.invalidateQueries({ queryKey: ["poliza", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !poliza) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/admin/contabilidad/polizas" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Póliza <span className="font-mono">{poliza.folio}</span>
              <EstadoBadge estado={poliza.estado} />
            </h1>
            <p className="text-xs text-muted-foreground capitalize">Tipo: {poliza.tipo}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {editable && (
            <>
              <Button variant="outline" size="sm" onClick={() => saveHeader.mutate()} disabled={saveHeader.isPending}>
                <Save className="h-4 w-4 mr-1" /> Guardar
              </Button>
              <Button size="sm" onClick={() => asentar.mutate()} disabled={!cuadra || asentar.isPending}>
                <Send className="h-4 w-4 mr-1" /> Asentar
              </Button>
            </>
          )}
          {poliza.estado === "asentada" && (
            <Button size="sm" variant="destructive" onClick={() => { if (confirm("¿Cancelar póliza asentada? Queda registrada como cancelada.")) cancelar.mutate(); }}>
              <XCircle className="h-4 w-4 mr-1" /> Cancelar
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Fecha</Label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={!editable} />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Concepto</Label>
          <Textarea rows={2} value={concepto} onChange={(e) => setConcepto(e.target.value)} disabled={!editable} />
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-2 py-2">Cuenta</th>
              <th className="text-left px-2 py-2 w-64">Concepto / UUID CFDI</th>
              <th className="text-right px-2 py-2 w-28">Cargo</th>
              <th className="text-right px-2 py-2 w-28">Abono</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {movs.map((m) => (
              <MovRow key={m.id} mov={m} cuentas={cuentas} editable={editable}
                onChange={(patch) => updateRow.mutate({ id: m.id, ...patch })}
                onDelete={() => deleteRow.mutate(m.id)}
              />
            ))}
            {movs.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Sin movimientos.</td></tr>
            )}
          </tbody>
          <tfoot className="bg-muted/30">
            <tr className="border-t border-border">
              <td colSpan={2} className="px-2 py-2 text-right text-xs uppercase tracking-wider text-muted-foreground">Totales</td>
              <td className="px-2 py-2 text-right font-mono text-sm">{mxn.format(totalCargos)}</td>
              <td className="px-2 py-2 text-right font-mono text-sm">{mxn.format(totalAbonos)}</td>
              <td></td>
            </tr>
            <tr>
              <td colSpan={2} className="px-2 py-2 text-right text-xs uppercase tracking-wider text-muted-foreground">Diferencia</td>
              <td colSpan={2} className={`px-2 py-2 text-right font-mono text-sm ${cuadra ? "text-emerald-500" : "text-destructive"}`}>
                {cuadra ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Cuadra</span> : mxn.format(diff)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {editable && (
        <Button variant="outline" size="sm" onClick={() => addRow.mutate()}>
          <Plus className="h-4 w-4 mr-1" /> Agregar movimiento
        </Button>
      )}
    </section>
  );
}

function MovRow({ mov, cuentas, editable, onChange, onDelete }: {
  mov: Mov;
  cuentas: Cuenta[];
  editable: boolean;
  onChange: (patch: Partial<Mov>) => void;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState(mov);
  useEffect(() => { setLocal(mov); }, [mov.id, mov.cargo, mov.abono, mov.cuenta_id, mov.concepto, mov.uuid_cfdi]);

  const commit = (patch: Partial<Mov>) => {
    setLocal({ ...local, ...patch });
    onChange(patch);
  };

  return (
    <tr className="border-t border-border">
      <td className="px-2 py-1.5">
        <Select
          value={local.cuenta_id}
          onValueChange={(v) => commit({ cuenta_id: v })}
          disabled={!editable}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-[320px]">
            {cuentas.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="font-mono text-xs">{c.codigo}</span> · {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-2 py-1.5 space-y-1">
        <Input
          className="h-7 text-xs" placeholder="Concepto"
          value={local.concepto ?? ""} disabled={!editable}
          onChange={(e) => setLocal({ ...local, concepto: e.target.value })}
          onBlur={() => commit({ concepto: local.concepto })}
        />
        <Input
          className="h-7 text-xs font-mono" placeholder="UUID CFDI"
          value={local.uuid_cfdi ?? ""} disabled={!editable}
          onChange={(e) => setLocal({ ...local, uuid_cfdi: e.target.value })}
          onBlur={() => commit({ uuid_cfdi: local.uuid_cfdi })}
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input
          type="number" step="0.01" min={0}
          className="h-8 text-right font-mono text-xs" disabled={!editable}
          value={local.cargo}
          onChange={(e) => setLocal({ ...local, cargo: Number(e.target.value), abono: 0 })}
          onBlur={() => commit({ cargo: local.cargo, abono: 0 })}
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input
          type="number" step="0.01" min={0}
          className="h-8 text-right font-mono text-xs" disabled={!editable}
          value={local.abono}
          onChange={(e) => setLocal({ ...local, abono: Number(e.target.value), cargo: 0 })}
          onBlur={() => commit({ abono: local.abono, cargo: 0 })}
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        {editable && (
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </td>
    </tr>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === "asentada") return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Asentada</Badge>;
  if (estado === "cancelada") return <Badge className="bg-destructive/15 text-destructive border-destructive/30">Cancelada</Badge>;
  return <Badge variant="outline">Borrador</Badge>;
}
