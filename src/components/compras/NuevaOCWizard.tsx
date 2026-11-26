import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Plus, Trash2, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { calcularSugerencias, fechasEntrega, fmtFecha, fmtMXN, fmtNum, redondearMultiplo, type HistItem } from "@/lib/oc-suggestions";
import { resumirSugerenciasOCFn } from "@/lib/compras-ai.functions";

const CUARENTENA_NOMBRE = "cuarentena";
type Lab = { id: string; nombre: string; dias_entrega: number | null; es_borrador: boolean };
type Prod = { id: string; nombre: string; sku: string | null; costo: number | null; multiplo_compra: number; laboratorio_id: string | null };
type Linea = { producto_id: string; cantidad: number; costo_lista: number; descuento_pct: number };

const hoyCDMX = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Entero sin el "0" pegado al escribir. */
function IntInput({ value, onChange, min = 0, step = 1, label }: { value: number; onChange: (n: number) => void; min?: number; step?: number; label: string }) {
  return (
    <input
      aria-label={label}
      type="number" inputMode="numeric" min={min} step={step}
      value={value === 0 ? "" : value}
      placeholder="0"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(Math.max(min, Math.trunc(Number(e.target.value.replace(/^0+(?=\d)/, "")) || 0)))}
      className="input w-24 text-right tabular-nums"
    />
  );
}

export function NuevaOCWizard({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [labId, setLabId] = useState("");
  const [nuevoProv, setNuevoProv] = useState("");
  const [almId, setAlmId] = useState("");
  const [fechaEsperada, setFechaEsperada] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [notas, setNotas] = useState("");
  const [meses, setMeses] = useState(6);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [busca, setBusca] = useState("");
  const [resumen, setResumen] = useState("");
  const resumirFn = useServerFn(resumirSugerenciasOCFn);
  const hoy = hoyCDMX();

  const { data: labs, refetch: refetchLabs } = useQuery({
    queryKey: ["labs-oc-wizard"],
    queryFn: async () => ((await supabase.from("laboratorios").select("id, nombre, dias_entrega, es_borrador").eq("activo", true).order("nombre")).data ?? []) as Lab[],
  });
  const { data: alms } = useQuery({
    queryKey: ["almacenes-activos-oc"],
    queryFn: async () => ((await supabase.from("almacenes").select("id, nombre, principal").eq("activo", true).order("nombre")).data ?? []) as { id: string; nombre: string; principal: boolean }[],
  });
  // Cuarentena por defecto: la mercancía entra a revisión antes de venderse.
  useEffect(() => {
    if (almId || !alms?.length) return;
    const q = alms.find((a) => a.nombre.toLowerCase().includes(CUARENTENA_NOMBRE) && !a.nombre.toLowerCase().includes("reclam"));
    if (q) setAlmId(q.id);
  }, [alms, almId]);
  const lab = labs?.find((l) => l.id === labId);
  const [diasLab, setDiasLab] = useState<number | null>(null);
  const guardarDias = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("laboratorios").update({ dias_entrega: diasLab }).eq("id", labId);
      if (error) throw error;
    },
    onSuccess: () => {
      const f = fechasEntrega(hoy, diasLab);
      setFechaEsperada(f.estimada ?? ""); setFechaLimite(f.limite ?? "");
      refetchLabs(); setDiasLab(null);
      toast.success("Días de entrega guardados");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const datos = useQuery({
    enabled: !!labId,
    queryKey: ["oc-wizard-datos", labId],
    queryFn: async () => {
      const prods: Prod[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("productos").select("id, nombre, sku, costo, multiplo_compra, laboratorio_id").eq("laboratorio_id", labId).eq("activo", true).order("nombre").range(from, from + 999);
        if (error) throw error;
        prods.push(...((data ?? []) as Prod[]));
        if ((data ?? []).length < 1000) break;
      }
      const ids = prods.map((p) => p.id);
      const hist: HistItem[] = [];
      const stock: Record<string, number> = {};
      const reorden: Record<string, number | null> = {};
      for (const c of chunks(ids, 150)) {
        const [h, s, r] = await Promise.all([
          supabase.from("oc_items").select("producto_id, cantidad, costo_unitario, ordenes_compra!inner(laboratorio_id, fecha_emision, estado)").in("producto_id", c).neq("ordenes_compra.estado", "cancelada").limit(5000),
          supabase.from("stock").select("producto_id, cantidad").in("producto_id", c),
          supabase.from("product_stock_params").select("producto_id, punto_reorden").in("producto_id", c),
        ]);
        if (h.error) throw h.error;
        for (const row of (h.data ?? []) as any[]) {
          hist.push({ producto_id: row.producto_id, cantidad: Number(row.cantidad), costo: Number(row.costo_unitario), fecha: row.ordenes_compra.fecha_emision, laboratorio_id: row.ordenes_compra.laboratorio_id });
        }
        for (const row of s.data ?? []) stock[row.producto_id] = (stock[row.producto_id] ?? 0) + Number(row.cantidad);
        for (const row of r.data ?? []) reorden[row.producto_id] = row.punto_reorden == null ? null : Number(row.punto_reorden);
      }
      return { prods, hist, stock, reorden };
    },
  });

  const prodById = useMemo(() => new Map((datos.data?.prods ?? []).map((p) => [p.id, p])), [datos.data]);
  const nombreLab = useMemo(() => new Map((labs ?? []).map((l) => [l.id, l.nombre])), [labs]);

  /** Otros laboratorios que han surtido el producto, con su último costo. */
  const tambienEn = useMemo(() => {
    const m = new Map<string, { lab: string; costo: number; fecha: string }[]>();
    for (const h of datos.data?.hist ?? []) {
      if (h.laboratorio_id === labId) continue;
      const arr = m.get(h.producto_id) ?? [];
      const prev = arr.find((x) => x.lab === h.laboratorio_id);
      if (!prev) arr.push({ lab: h.laboratorio_id, costo: h.costo, fecha: h.fecha });
      else if (h.fecha > prev.fecha) Object.assign(prev, { costo: h.costo, fecha: h.fecha });
      m.set(h.producto_id, arr);
    }
    return m;
  }, [datos.data, labId]);

  const sugerencias = useMemo(() => {
    if (!datos.data) return [];
    const multiplo = Object.fromEntries(datos.data.prods.map((p) => [p.id, p.multiplo_compra]));
    return calcularSugerencias({
      historial: datos.data.hist.filter((h) => h.laboratorio_id === labId),
      meses, hoyISO: hoy, existencia: datos.data.stock, puntoReorden: datos.data.reorden, multiplo,
    });
  }, [datos.data, meses, labId, hoy]);

  const agregar = (producto_id: string, cantidad = 0) => {
    if (lineas.some((l) => l.producto_id === producto_id)) return;
    const p = prodById.get(producto_id);
    const ultimo = sugerencias.find((s) => s.producto_id === producto_id)?.ultimoCosto;
    setLineas((ls) => [...ls, { producto_id, cantidad, costo_lista: Number(ultimo ?? p?.costo ?? 0), descuento_pct: 0 }]);
  };
  const upd = (i: number, patch: Partial<Linea>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const neto = (l: Linea) => +(l.costo_lista * (1 - l.descuento_pct / 100)).toFixed(4);
  const total = lineas.reduce((s, l) => s + neto(l) * l.cantidad, 0);

  const elegirLab = (id: string) => {
    setLabId(id); setLineas([]); setResumen(""); setDiasLab(null);
    const l = labs?.find((x) => x.id === id);
    const f = fechasEntrega(hoy, l?.dias_entrega);
    setFechaEsperada(f.estimada ?? ""); setFechaLimite(f.limite ?? "");
  };

  const pedirResumen = useMutation({
    mutationFn: async () => resumirFn({ data: {
      laboratorio: lab?.nombre ?? "",
      items: sugerencias.slice(0, 40).map((s) => ({ nombre: prodById.get(s.producto_id)?.nombre ?? "", cantidad: s.cantidad, motivo: s.motivo })),
    } }),
    onSuccess: (r) => setResumen(r.texto || "Sin comentarios."),
    onError: (e: Error) => toast.error(`No se pudo generar el resumen: ${e.message}`),
  });

  const crear = useMutation({
    mutationFn: async () => {
      let lid = labId;
      if (!lid && nuevoProv.trim()) {
        const { data, error } = await supabase.from("laboratorios").insert({ nombre: nuevoProv.trim(), es_borrador: true, activo: true }).select("id").single();
        if (error) throw error;
        lid = data.id;
      }
      if (!lid) throw new Error("Selecciona un laboratorio o escribe el proveedor nuevo");
      if (!almId) throw new Error("Selecciona almacén");
      for (const l of lineas) {
        if (!Number.isInteger(l.cantidad) || l.cantidad <= 0) throw new Error(`${prodById.get(l.producto_id)?.nombre}: piezas deben ser entero mayor a 0`);
        if (l.descuento_pct < 0 || l.descuento_pct > 100) throw new Error("Descuento entre 0 y 100%");
      }
      const { data: u } = await supabase.auth.getUser();
      const { data: oc, error } = await supabase.from("ordenes_compra").insert({
        laboratorio_id: lid, almacen_id: almId, fecha_esperada: fechaEsperada || null, fecha_limite: fechaLimite || null,
        notas: notas || null, created_by: u.user?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      if (lineas.length) {
        const { error: e2 } = await supabase.from("oc_items").insert(lineas.map((l) => ({
          oc_id: oc.id, producto_id: l.producto_id, cantidad: l.cantidad, costo_lista: l.costo_lista, descuento_pct: l.descuento_pct, costo_unitario: neto(l),
        })));
        if (e2) throw e2;
      }
      return oc.id as string;
    },
    onSuccess: (id) => { toast.success("Orden creada"); onSaved(id); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtrados = (datos.data?.prods ?? []).filter((p) => {
    const q = busca.trim().toLowerCase();
    return !q || p.nombre.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
  }).slice(0, 30);

  const puedeSeguir = paso === 1 ? (!!labId || !!nuevoProv.trim()) && !!almId : true;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent expandable className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Nueva orden de compra</SheetTitle>
          <ol className="flex gap-2 text-xs" aria-label="Pasos">
            {["Proveedor", "Productos", "Revisar"].map((t, i) => (
              <li key={t} className={`rounded-full px-3 py-1 ${paso === i + 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i + 1}. {t}</li>
            ))}
          </ol>
        </SheetHeader>

        {paso === 1 && (
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="oc-lab" className="text-sm font-medium">Laboratorio</label>
              <select id="oc-lab" value={labId} onChange={(e) => elegirLab(e.target.value)} className="input mt-1">
                <option value="">— Selecciona —</option>
                {labs?.map((l) => <option key={l.id} value={l.id}>{l.nombre}{l.es_borrador ? " (borrador)" : ""}</option>)}
              </select>
              {!labId && (
                <div className="mt-2">
                  <label htmlFor="oc-prov" className="text-xs text-muted-foreground">¿No está registrado? Escribe el proveedor (queda como borrador pendiente de alta)</label>
                  <input id="oc-prov" value={nuevoProv} maxLength={200} onChange={(e) => setNuevoProv(e.target.value)} className="input mt-1" placeholder="Nombre del proveedor" />
                </div>
              )}
              {lab && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <label htmlFor="oc-dias">Días de entrega de este laboratorio</label>
                  <IntInput label="Días de entrega" value={diasLab ?? lab.dias_entrega ?? 0} onChange={(n) => setDiasLab(n)} />
                  <button className="btn-secondary text-xs" disabled={diasLab == null || guardarDias.isPending} onClick={() => guardarDias.mutate()}>Guardar y recalcular fechas</button>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="oc-alm" className="text-sm font-medium">Almacén destino</label>
              <select id="oc-alm" value={almId} onChange={(e) => setAlmId(e.target.value)} className="input mt-1">
                <option value="">— Selecciona —</option>
                {alms?.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">Por defecto Cuarentena, para revisar la mercancía al recibirla.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="oc-fe" className="text-sm font-medium">Fecha estimada de recepción</label>
                <input id="oc-fe" type="date" value={fechaEsperada} onChange={(e) => setFechaEsperada(e.target.value)} className="input mt-1" />
              </div>
              <div>
                <label htmlFor="oc-fl" className="text-sm font-medium">Fecha límite (retraso)</label>
                <input id="oc-fl" type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} className="input mt-1" />
              </div>
            </div>
            <div>
              <label htmlFor="oc-notas" className="text-sm font-medium">Notas</label>
              <textarea id="oc-notas" rows={2} maxLength={500} value={notas} onChange={(e) => setNotas(e.target.value)} className="input mt-1" />
            </div>
          </div>
        )}

        {paso === 2 && (
          <div className="mt-4 space-y-5">
            {!labId ? (
              <p className="text-sm text-muted-foreground">Proveedor nuevo: no hay historial ni catálogo. Puedes crear la orden y agregar productos después.</p>
            ) : datos.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando catálogo e historial…</p>
            ) : datos.error ? (
              <p className="text-sm text-destructive">No se pudo cargar: {(datos.error as Error).message}</p>
            ) : (
              <>
                <section className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Sugerencias según compras pasadas</h3>
                    <div className="flex items-center gap-2 text-sm">
                      <label htmlFor="oc-meses">Promedio de</label>
                      <select id="oc-meses" className="input w-auto" value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
                        {[3, 6, 12].map((m) => <option key={m} value={m}>{m} meses</option>)}
                      </select>
                      <button className="btn-secondary" disabled={!sugerencias.length} onClick={() => sugerencias.forEach((s) => agregar(s.producto_id, s.cantidad))}>Agregar todas</button>
                    </div>
                  </div>
                  {sugerencias.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Sin sugerencias: no hay compras recientes a este laboratorio o la existencia ya cubre el mes.</p>
                  ) : (
                    <>
                      <ul className="mt-2 divide-y divide-border">
                        {sugerencias.slice(0, 40).map((s) => {
                          const p = prodById.get(s.producto_id);
                          const ya = lineas.some((l) => l.producto_id === s.producto_id);
                          return (
                            <li key={s.producto_id} className="flex items-start justify-between gap-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{p?.sku ? `${p.sku} · ` : ""}{p?.nombre}</p>
                                <p className="text-xs text-muted-foreground">{s.motivo}</p>
                              </div>
                              <button className="btn-secondary shrink-0" disabled={ya} onClick={() => agregar(s.producto_id, s.cantidad)}>
                                {ya ? "Agregado" : `+ ${fmtNum(s.cantidad)} pzas`}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="mt-2">
                        <button className="btn-secondary text-xs" disabled={pedirResumen.isPending} onClick={() => pedirResumen.mutate()}>
                          {pedirResumen.isPending ? "Analizando…" : "Explicar con IA"}
                        </button>
                        {resumen && <p className="mt-2 whitespace-pre-line rounded-md bg-muted p-2 text-sm">{resumen}</p>}
                      </div>
                    </>
                  )}
                </section>

                <section>
                  <label htmlFor="oc-busca" className="text-sm font-medium">Agregar producto de {lab?.nombre}</label>
                  <div className="relative mt-1">
                    <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input id="oc-busca" value={busca} onChange={(e) => setBusca(e.target.value)} className="input pl-8" placeholder="Buscar por clave o nombre (solo este laboratorio)" />
                  </div>
                  {busca && (
                    <ul className="mt-1 max-h-60 overflow-y-auto rounded-md border border-border">
                      {filtrados.length === 0 && <li className="p-2 text-sm text-muted-foreground">Sin resultados en este laboratorio.</li>}
                      {filtrados.map((p) => (
                        <li key={p.id}>
                          <button className="flex w-full items-center justify-between gap-2 p-2 text-left text-sm hover:bg-muted focus-visible:bg-muted" onClick={() => { agregar(p.id, redondearMultiplo(1, p.multiplo_compra)); setBusca(""); }}>
                            <span className="truncate">{p.sku ? `${p.sku} · ` : ""}{p.nombre}</span><Plus className="h-4 w-4 shrink-0" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <LineasTabla lineas={lineas} prodById={prodById} tambienEn={tambienEn} nombreLab={nombreLab} upd={upd} quitar={(i) => setLineas((ls) => ls.filter((_, j) => j !== i))} neto={neto} />
              </>
            )}
          </div>
        )}

        {paso === 3 && (
          <div className="mt-4 space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-2">
              <dt className="text-muted-foreground">Proveedor</dt><dd>{lab?.nombre ?? `${nuevoProv} (borrador)`}</dd>
              <dt className="text-muted-foreground">Almacén</dt><dd>{alms?.find((a) => a.id === almId)?.nombre}</dd>
              <dt className="text-muted-foreground">Recepción estimada</dt><dd>{fmtFecha(fechaEsperada)}</dd>
              <dt className="text-muted-foreground">Fecha límite</dt><dd>{fmtFecha(fechaLimite)}</dd>
              <dt className="text-muted-foreground">Partidas</dt><dd>{fmtNum(lineas.length)} · {fmtNum(lineas.reduce((s, l) => s + l.cantidad, 0))} pzas</dd>
              <dt className="text-muted-foreground">Subtotal</dt><dd className="font-semibold">{fmtMXN(total)}</dd>
            </dl>
          </div>
        )}

        <div className="sticky bottom-0 mt-6 flex justify-between gap-2 border-t border-border bg-background py-3">
          <button className="btn-secondary" onClick={() => (paso === 1 ? onClose() : setPaso((p) => (p - 1) as 1 | 2))}>{paso === 1 ? "Cancelar" : "Atrás"}</button>
          {paso < 3 ? (
            <button className="btn-primary" disabled={!puedeSeguir} onClick={() => setPaso((p) => (p + 1) as 2 | 3)}>Siguiente</button>
          ) : (
            <button className="btn-primary" disabled={crear.isPending} onClick={() => crear.mutate()}>{crear.isPending ? "Creando…" : "Crear orden"}</button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LineasTabla({ lineas, prodById, tambienEn, nombreLab, upd, quitar, neto }: {
  lineas: Linea[]; prodById: Map<string, Prod>; tambienEn: Map<string, { lab: string; costo: number }[]>; nombreLab: Map<string, string>;
  upd: (i: number, p: Partial<Linea>) => void; quitar: (i: number) => void; neto: (l: Linea) => number;
}) {
  if (!lineas.length) return <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Aún no hay productos en la orden.</p>;
  return (
    <div className="space-y-2">
      {lineas.map((l, i) => {
        const p = prodById.get(l.producto_id);
        const mult = Math.max(1, p?.multiplo_compra ?? 1);
        const otros = tambienEn.get(l.producto_id) ?? [];
        return (
          <div key={l.producto_id} className="rounded-md border border-border p-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{p?.sku ? `${p.sku} · ` : ""}{p?.nombre}</p>
              <button aria-label="Quitar" onClick={() => quitar(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
            {otros.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">También en: {otros.map((o) => `${nombreLab.get(o.lab) ?? "otro laboratorio"} (${fmtMXN(o.costo)})`).join(", ")}</p>
            )}
            <div className="mt-2 flex flex-wrap items-end gap-3 text-xs">
              <label className="flex flex-col gap-1">Piezas<IntInput label="Piezas" value={l.cantidad} step={mult} onChange={(n) => upd(i, { cantidad: n })} /></label>
              <label className="flex flex-col gap-1">Precio lista
                <input type="number" min={0} step="0.01" value={l.costo_lista || ""} placeholder="0" onChange={(e) => upd(i, { costo_lista: Math.max(0, Number(e.target.value) || 0) })} className="input w-28 text-right" />
              </label>
              <label className="flex flex-col gap-1">Desc. %
                <input type="number" min={0} max={100} step="0.5" value={l.descuento_pct || ""} placeholder="0" onChange={(e) => upd(i, { descuento_pct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} className="input w-20 text-right" />
              </label>
              <span className="ml-auto text-right">Neto {fmtMXN(neto(l))}<br /><b>{fmtMXN(neto(l) * l.cantidad)}</b></span>
            </div>
            {mult > 1 && l.cantidad % mult !== 0 && (
              <p className="mt-1 text-xs text-destructive">
                Se compra en múltiplos de {mult}. <button className="underline" onClick={() => upd(i, { cantidad: redondearMultiplo(l.cantidad, mult) })}>Usar {fmtNum(redondearMultiplo(l.cantidad, mult))}</button>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
