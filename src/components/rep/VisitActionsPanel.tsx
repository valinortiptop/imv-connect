// Acciones dentro de la visita: cobro, recolección de RC y entrega de pedido.
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  listVisitActionsFn,
  listClientOpenInvoicesFn,
  listClientPendingDeliveriesFn,
  registerVisitPaymentFn,
  registerRecetaFn,
  deliverOrderFn,
} from "@/lib/rep-visit-actions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Banknote, FileText, PackageCheck, Camera, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import SignaturePad from "./SignaturePad";

type Mode = "cobro" | "receta" | "entrega";
type Props = { visitId: string; clienteId: string; userId: string };

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

async function uploadFiles(files: File[], userId: string, visitId: string, tag: string) {
  const paths: string[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/${visitId}/actions/${crypto.randomUUID()}-${tag}.${ext}`;
    const { error } = await supabase.storage
      .from("rep-evidence")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

function PhotoPicker({ files, setFiles, label }: { files: File[]; setFiles: (f: File[]) => void; label: string }) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) setFiles([...files, ...Array.from(e.target.files)]);
          e.target.value = "";
        }}
      />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => ref.current?.click()}>
          <Camera className="mr-1 h-3.5 w-3.5" /> Agregar foto
        </Button>
        {files.map((f, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]">
            <span className="max-w-[120px] truncate">{f.name}</span>
            <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Quitar">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function VisitActionsPanel({ visitId, clienteId, userId }: Props) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode | null>(null);
  const fetchActions = useServerFn(listVisitActionsFn);
  const actionsQ = useQuery({
    queryKey: ["visit-actions", visitId],
    queryFn: () => fetchActions({ data: { visitId } }),
  });
  const done = () => {
    setMode(null);
    qc.invalidateQueries({ queryKey: ["visit-actions", visitId] });
  };

  const btn = (m: Mode, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(mode === m ? null : m)}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border p-3 text-xs font-medium transition-colors hover:bg-muted",
        mode === m && "border-primary bg-primary/10 text-primary",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {btn("cobro", <Banknote className="h-5 w-5" />, "Cobro")}
        {btn("receta", <FileText className="h-5 w-5" />, "Recolección RC")}
        {btn("entrega", <PackageCheck className="h-5 w-5" />, "Entrega de pedido")}
      </div>

      {mode === "cobro" && <CobroForm visitId={visitId} clienteId={clienteId} userId={userId} onDone={done} />}
      {mode === "receta" && <RecetaForm visitId={visitId} clienteId={clienteId} userId={userId} onDone={done} />}
      {mode === "entrega" && <EntregaForm visitId={visitId} clienteId={clienteId} userId={userId} onDone={done} />}

      <div>
        <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Registradas en esta visita</p>
        {actionsQ.isLoading && <p className="text-xs text-muted-foreground">Cargando…</p>}
        {!actionsQ.isLoading && !(actionsQ.data?.actions ?? []).length && (
          <p className="text-xs text-muted-foreground">Aún no hay acciones.</p>
        )}
        <ul className="space-y-1">
          {(actionsQ.data?.actions ?? []).map((a: any) => (
            <li key={a.id} className="rounded-md border px-2 py-1.5 text-xs">
              {a.tipo === "cobro" && (
                <>💵 Cobro {fmtMXN(a.monto)}{a.factura_folio ? ` · Factura ${a.factura_folio}` : ""}</>
              )}
              {a.tipo === "receta" && (
                <>📄 RC{a.folio ? ` ${a.folio}` : ""}{a.piezas != null ? ` · ${a.piezas} pzs` : ""} · {a.photo_paths?.length ?? 0} foto(s)</>
              )}
              {a.tipo === "entrega" && (
                <>📦 Entrega pedido {a.pedido_folio ?? ""} · Recibió {a.received_by}</>
              )}
              <span className="ml-1 text-muted-foreground">
                · {new Date(a.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

type FormProps = Props & { onDone: () => void };

function CobroForm({ visitId, clienteId, userId, onDone }: FormProps) {
  const fetchInv = useServerFn(listClientOpenInvoicesFn);
  const register = useServerFn(registerVisitPaymentFn);
  const invQ = useQuery({
    queryKey: ["client-open-invoices", clienteId],
    queryFn: () => fetchInv({ data: { clienteId } }),
  });
  const [facturaId, setFacturaId] = useState("");
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<string>("efectivo");
  const [referencia, setReferencia] = useState("");
  const [notas, setNotas] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const facturas = invQ.data?.facturas ?? [];
  const sel = facturas.find((f: any) => f.id === facturaId);

  const m = useMutation({
    mutationFn: async () => {
      const amount = Number(monto);
      if (!facturaId) throw new Error("Selecciona una factura");
      if (!(amount > 0)) throw new Error("Captura un monto válido");
      const photoPaths = await uploadFiles(files, userId, visitId, "cobro");
      return register({
        data: { visitId, facturaId, monto: amount, metodo: metodo as any, referencia: referencia || null, notas: notas || null, photoPaths },
      });
    },
    onSuccess: () => {
      toast.success("Cobro registrado");
      invQ.refetch();
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo registrar el cobro"),
  });

  return (
    <div className="space-y-2 rounded-lg border p-3">
      {invQ.isLoading ? (
        <p className="text-xs text-muted-foreground">Cargando facturas…</p>
      ) : !facturas.length ? (
        <p className="text-xs text-muted-foreground">Este cliente no tiene facturas abiertas.</p>
      ) : (
        <>
          <div>
            <Label className="text-xs">Factura</Label>
            <Select
              value={facturaId}
              onValueChange={(v) => {
                setFacturaId(v);
                const f = facturas.find((x: any) => x.id === v);
                if (f) setMonto(String(Number(f.saldo).toFixed(2)));
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecciona factura…" /></SelectTrigger>
              <SelectContent>
                {facturas.map((f: any) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.folio ?? "s/folio"} · saldo {fmtMXN(f.saldo)}
                    {f.overdue_days > 0 ? ` · ${f.overdue_days}d vencida` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Monto</Label>
              <Input type="number" inputMode="decimal" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
              {sel && <p className="mt-0.5 text-[11px] text-muted-foreground">Saldo: {fmtMXN(sel.saldo)}</p>}
            </div>
            <div>
              <Label className="text-xs">Método</Label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Referencia (opcional)</Label>
            <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="No. de cheque, transferencia…" />
          </div>
          <Textarea rows={2} placeholder="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
          <PhotoPicker files={files} setFiles={setFiles} label="Comprobante (opcional)" />
          <Button size="sm" className="w-full" onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Registrar cobro
          </Button>
        </>
      )}
    </div>
  );
}

function RecetaForm({ visitId, clienteId, userId, onDone }: FormProps) {
  const fetchPed = useServerFn(listClientPendingDeliveriesFn);
  const register = useServerFn(registerRecetaFn);
  const pedQ = useQuery({
    queryKey: ["client-pending-orders", clienteId],
    queryFn: () => fetchPed({ data: { clienteId } }),
  });
  const [folio, setFolio] = useState("");
  const [piezas, setPiezas] = useState("");
  const [notas, setNotas] = useState("");
  const [pedidoId, setPedidoId] = useState("none");
  const [files, setFiles] = useState<File[]>([]);

  const m = useMutation({
    mutationFn: async () => {
      if (!files.length) throw new Error("Agrega al menos una foto de la receta");
      const photoPaths = await uploadFiles(files, userId, visitId, "receta");
      return register({
        data: {
          visitId,
          folio: folio || null,
          piezas: piezas ? Number(piezas) : null,
          notas: notas || null,
          pedidoId: pedidoId === "none" ? null : pedidoId,
          photoPaths,
        },
      });
    },
    onSuccess: () => {
      toast.success("Receta registrada");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo registrar la receta"),
  });

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <PhotoPicker files={files} setFiles={setFiles} label="Foto(s) de la receta" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Folio / No. (opcional)</Label>
          <Input value={folio} onChange={(e) => setFolio(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Piezas (opcional)</Label>
          <Input type="number" inputMode="numeric" min="0" value={piezas} onChange={(e) => setPiezas(e.target.value)} />
        </div>
      </div>
      {(pedQ.data?.pedidos ?? []).length > 0 && (
        <div>
          <Label className="text-xs">Vincular a pedido (opcional)</Label>
          <Select value={pedidoId} onValueChange={setPedidoId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin pedido</SelectItem>
              {(pedQ.data?.pedidos ?? []).map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.folio ?? p.order_code ?? p.id.slice(0, 8)} · {fmtMXN(p.total)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <Textarea rows={2} placeholder="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
      <Button size="sm" className="w-full" onClick={() => m.mutate()} disabled={m.isPending}>
        {m.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Registrar RC
      </Button>
    </div>
  );
}

function EntregaForm({ visitId, clienteId, userId, onDone }: FormProps) {
  const qc = useQueryClient();
  const fetchPed = useServerFn(listClientPendingDeliveriesFn);
  const deliver = useServerFn(deliverOrderFn);
  const pedQ = useQuery({
    queryKey: ["client-pending-orders", clienteId],
    queryFn: () => fetchPed({ data: { clienteId } }),
  });
  const [pedidoId, setPedidoId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [notas, setNotas] = useState("");
  const pedidos = pedQ.data?.pedidos ?? [];

  const m = useMutation({
    mutationFn: async ({ blob, name }: { blob: Blob; name: string }) => {
      if (!pedidoId) throw new Error("Selecciona el pedido a entregar");
      if (!name.trim()) throw new Error("Captura el nombre de quien recibe");
      const sigPath = `${userId}/${visitId}/actions/${crypto.randomUUID()}-entrega-firma.png`;
      const { error } = await supabase.storage
        .from("rep-evidence")
        .upload(sigPath, blob, { upsert: false, contentType: "image/png" });
      if (error) throw error;
      const photoPaths = await uploadFiles(files, userId, visitId, "entrega");
      return deliver({
        data: { visitId, pedidoId, receivedBy: name.trim(), signaturePath: sigPath, photoPaths, notas: notas || null },
      });
    },
    onSuccess: () => {
      toast.success("Pedido marcado como entregado");
      qc.invalidateQueries({ queryKey: ["client-pending-orders", clienteId] });
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo registrar la entrega"),
  });

  return (
    <div className="space-y-2 rounded-lg border p-3">
      {pedQ.isLoading ? (
        <p className="text-xs text-muted-foreground">Cargando pedidos…</p>
      ) : !pedidos.length ? (
        <p className="text-xs text-muted-foreground">Este cliente no tiene pedidos pendientes de entrega.</p>
      ) : (
        <>
          <div>
            <Label className="text-xs">Pedido</Label>
            <Select value={pedidoId} onValueChange={setPedidoId}>
              <SelectTrigger><SelectValue placeholder="Selecciona pedido…" /></SelectTrigger>
              <SelectContent>
                {pedidos.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.folio ?? p.order_code ?? p.id.slice(0, 8)} · {p.estado} · {fmtMXN(p.total)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <PhotoPicker files={files} setFiles={setFiles} label="Foto de la entrega (opcional)" />
          <Textarea rows={2} placeholder="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
          <p className="text-xs text-muted-foreground">Nombre y firma de quien recibe:</p>
          <SignaturePad saving={m.isPending} onSave={(blob, name) => m.mutateAsync({ blob, name }).then(() => undefined, () => undefined)} />
        </>
      )}
    </div>
  );
}
