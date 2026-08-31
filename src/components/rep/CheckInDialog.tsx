import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { checkInFn, checkOutFn, getOpenVisitFn } from "@/lib/rep.functions";
import { toast } from "sonner";
import { MapPin, Plus, Trash2, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import OrderQuickCreate from "./OrderQuickCreate";
import EvidenceUploader from "./EvidenceUploader";
import ShelfPhotoUploader from "./ShelfPhotoUploader";
import VisitFormFiller from "./VisitFormFiller";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Cliente visitado (opcional si se visita un prospecto). */
  clienteId?: string;
  /** Prospecto visitado (opcional si se visita un cliente). */
  prospectId?: string;
  clienteNombre: string;
  /** Visita improvisada: no estaba en la ruta planeada del día. */
  unplanned?: boolean;
  /** Visita a la oficina/matriz IMV (sin cliente ni prospecto). */
  office?: boolean;
  /** Motivo inicial de la visita a oficina. */
  officePurpose?: string;
};

export default function CheckInDialog({ open, onOpenChange, clienteId, prospectId, clienteNombre, unplanned, office, officePurpose: officePurposeProp }: Props) {
  const qc = useQueryClient();
  const doCheckIn = useServerFn(checkInFn);
  const doCheckOut = useServerFn(checkOutFn);
  const getOpenVisit = useServerFn(getOpenVisitFn);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [checkInAt, setCheckInAt] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [step, setStep] = useState<"start" | "in-visit">("start");
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState<string>("");
  const [agreements, setAgreements] = useState<{ description: string; due_date?: string }[]>([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [needsOverride, setNeedsOverride] = useState(false);
  const [distanceInfo, setDistanceInfo] = useState<number | null>(null);
  const [unplannedReason, setUnplannedReason] = useState("");
  const [geoState, setGeoState] = useState<"idle" | "asking" | "ok" | "denied" | "error">("idle");
  const [identityError, setIdentityError] = useState(false);
  const [officePurpose, setOfficePurpose] = useState<string>(officePurposeProp ?? OFFICE_PURPOSES[0]);


  const requestGeo = () => {
    if (!navigator.geolocation) {
      setGeoState("error");
      return;
    }
    setGeoState("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoState("ok");
      },
      (err) => {
        setGeo(null);
        setGeoState(err?.code === err?.PERMISSION_DENIED ? "denied" : "error");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  useEffect(() => {
    if (!open) return;
    setStep("start");
    setVisitId(null);
    setCheckInAt(null);
    setNotes("");
    setOutcome("");
    setAgreements([]);
    setOverrideReason("");
    setNeedsOverride(false);
    setDistanceInfo(null);
    setUnplannedReason("");
    setGeoState("idle");
    setIdentityError(false);
    requestGeo();
    // Reanudar visita abierta (check-in sin check-out) de este cliente
    let cancelled = false;
    getOpenVisit({ data: { clienteId, prospectId } })
      .then((r: any) => {
        if (cancelled || !r?.visit) return;
        setVisitId(r.visit.id);
        setCheckInAt(r.visit.check_in_at);
        setDistanceInfo(r.visit.distance_m ?? null);
        setStep("in-visit");
        toast.info("Tienes una visita abierta con este cliente. Registra el check-out para cerrarla.");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, clienteId, getOpenVisit]);

  // Cronómetro de la visita en curso
  useEffect(() => {
    if (step !== "in-visit" || !checkInAt) return;
    setNowTs(Date.now());
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step, checkInAt]);

  const elapsedMs = checkInAt ? Math.max(0, nowTs - new Date(checkInAt).getTime()) : 0;
  const elapsedLabel = (() => {
    const total = Math.floor(elapsedMs / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0
      ? `${h}h ${String(m).padStart(2, "0")}m`
      : `${m}:${String(s).padStart(2, "0")}`;
  })();


  const startVisit = useMutation({
    mutationFn: async () => {
      const tid = toast.loading("Registrando check-in…");
      try {
        const r = await doCheckIn({
          data: {
            clienteId,
            prospectId,
            lat: geo?.lat,
            lng: geo?.lng,
            overrideReason: overrideReason || undefined,
            unplanned: unplanned || undefined,
            unplannedReason: unplanned ? unplannedReason || undefined : undefined,
          },
        });
        toast.dismiss(tid);
        return r;
      } catch (e) {
        toast.dismiss(tid);
        throw e;
      }
    },
    onSuccess: (r: any) => {
      setVisitId(r.visit.id);
      setCheckInAt(r.visit.check_in_at ?? new Date().toISOString());
      setDistanceInfo(r.distanceM ?? null);
      setStep("in-visit");
      toast.success(
        r.distanceM != null
          ? `Check-in registrado (${r.distanceM}m del cliente)`
          : "Check-in registrado",
      );
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? e ?? "Error desconocido al registrar check-in");
      const low = msg.toLowerCase();
      if (low.includes("override")) {
        setNeedsOverride(true);
        const m = msg.match(/(\d+)m/);
        if (m) setDistanceInfo(parseInt(m[1]));
        toast.error(`Estás lejos del cliente. Ingresa un motivo para continuar.`);
      } else if (low.includes("row-level security") || low.includes("ligada a una ficha")) {
        setIdentityError(true);
        toast.error("Tu cuenta no está ligada a tu ficha de vendedor.");
      } else {
        toast.error(msg);
      }
    },

  });


  const finish = useMutation({
    mutationFn: async () => {
      const tid = toast.loading("Finalizando visita…");
      try {
        const r = await doCheckOut({
          data: {
            visitId: visitId!,
            lat: geo?.lat,
            lng: geo?.lng,
            notes: notes || undefined,
            outcome: (outcome || undefined) as any,
            agreements: agreements.filter((a) => a.description.trim().length > 0),
          },
        });
        toast.dismiss(tid);
        return r;
      } catch (e) {
        toast.dismiss(tid);
        throw e;
      }
    },
    onSuccess: () => {
      const mins = Math.max(1, Math.round(elapsedMs / 60000));
      toast.success(`Check-out registrado · duración ${mins} min`);
      qc.invalidateQueries({ queryKey: ["open-visit"] });
      qc.invalidateQueries({ queryKey: ["client-visits", clienteId] });
      qc.invalidateQueries({ queryKey: ["rep-visits"] });
      qc.invalidateQueries({ queryKey: ["daily-routes-summary"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(String(e?.message ?? e ?? "Error al finalizar visita")),
  });


  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then((r) => setUserId(r.data.user?.id ?? null));
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto overflow-x-hidden sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {step === "start" ? "Iniciar visita" : "Visita en curso"}
            {step === "in-visit" && checkInAt && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                <Clock className="h-3.5 w-3.5" /> {elapsedLabel}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {clienteNombre}
            {step === "in-visit" && checkInAt
              ? ` · check-in ${new Date(checkInAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </DialogDescription>
        </DialogHeader>


        {step === "start" && (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {geo
                  ? `Ubicación: ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}`
                  : geoState === "asking"
                    ? "Obteniendo ubicación…"
                    : "Sin acceso a ubicación"}
              </div>
              {!geo && geoState !== "asking" && (
                <div className="mt-2 space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
                  <div className="text-[13px] text-amber-700 dark:text-amber-500">
                    {geoState === "denied"
                      ? "Bloqueaste la ubicación en este navegador. Ábrela desde el candado 🔒 junto a la dirección web → Permisos → Ubicación → Permitir, y vuelve a intentar."
                      : "No pudimos obtener tu ubicación. Activa el GPS y permite la ubicación para registrar la visita con evidencia."}
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={requestGeo}>
                    <MapPin className="mr-1.5 h-3.5 w-3.5" /> Activar ubicación
                  </Button>
                  <div className="text-[11px] text-muted-foreground">
                    Puedes hacer check-in sin ubicación, pero quedará marcado como sin evidencia de GPS.
                  </div>
                </div>
              )}
            </div>

            {identityError && (
              <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" /> Cuenta sin ficha de vendedor
                </div>
                <div className="text-[13px] text-muted-foreground">
                  Tu usuario no está ligado a una ficha de representante, por eso el sistema no
                  puede guardar la visita. Pide a sistemas que ligue tu correo en Administración →
                  Representantes y vuelve a intentar.
                </div>
              </div>
            )}

            {unplanned && (
              <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                <div className="text-sm font-medium text-amber-600">Visita fuera de ruta</div>
                <Label className="text-xs">Motivo (opcional)</Label>
                <Textarea
                  rows={2}
                  value={unplannedReason}
                  onChange={(e) => setUnplannedReason(e.target.value)}
                  placeholder="p.ej. el cliente llamó y pidió pasar hoy"
                />
              </div>
            )}

            {needsOverride && (
              <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Estás lejos del cliente registrado
                  {distanceInfo != null ? ` (~${distanceInfo}m)` : ""}
                </div>
                <Label className="text-xs">Motivo para hacer check-in aquí</Label>
                <Textarea
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="p.ej. cliente cambió de sucursal, cita en otra dirección"
                />
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                disabled={startVisit.isPending || (needsOverride && !overrideReason.trim())}
                onClick={() => startVisit.mutate()}
              >
                Registrar check-in
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "in-visit" && visitId && (
          <Tabs defaultValue="cierre" className="w-full">
            <TabsList className={cn("grid w-full", clienteId ? "grid-cols-5" : "grid-cols-3")}>
              <TabsTrigger value="cierre">Cierre</TabsTrigger>
              {clienteId && <TabsTrigger value="pedido">Pedido</TabsTrigger>}
              {clienteId && <TabsTrigger value="anaquel">Anaquel</TabsTrigger>}
              <TabsTrigger value="forms">Forms</TabsTrigger>
              <TabsTrigger value="evidencia">Evidencia</TabsTrigger>
            </TabsList>

            {clienteId && (
              <TabsContent value="pedido" className="pt-2">
                <OrderQuickCreate
                  clienteId={clienteId}
                  visitId={visitId}
                  onCreated={() => setOutcome("pedido")}
                />
              </TabsContent>
            )}

            {clienteId && (
            <TabsContent value="anaquel" className="pt-2">
              {userId ? (
                <ShelfPhotoUploader
                  visitId={visitId}
                  clienteId={clienteId}
                  userId={userId}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Cargando sesión…</p>
              )}
            </TabsContent>
            )}

            <TabsContent value="forms" className="pt-2">
              <VisitFormFiller visitId={visitId} />
            </TabsContent>

            <TabsContent value="evidencia" className="pt-2">
              {userId ? (
                <EvidenceUploader visitId={visitId} userId={userId} />
              ) : (
                <p className="text-sm text-muted-foreground">Cargando sesión…</p>
              )}
            </TabsContent>

            <TabsContent value="cierre" className="space-y-3 pt-2">
              {distanceInfo != null && (
                <div className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                  Check-in registrado a {distanceInfo}m del cliente.
                </div>
              )}
              <div>
                <Label>Resultado</Label>
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pedido">Pedido levantado</SelectItem>
                    <SelectItem value="sin_pedido">Sin pedido</SelectItem>
                    <SelectItem value="seguimiento">Requiere seguimiento</SelectItem>
                    <SelectItem value="incidencia">Incidencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label>Acuerdos</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAgreements((a) => [...a, { description: "" }])}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Añadir
                  </Button>
                </div>
                <div className="space-y-2">
                  {agreements.map((a, i) => (
                    <div key={i} className="flex gap-1">
                      <Input
                        placeholder="Compromiso"
                        value={a.description}
                        onChange={(e) => {
                          const copy = [...agreements];
                          copy[i] = { ...copy[i], description: e.target.value };
                          setAgreements(copy);
                        }}
                      />
                      <Input
                        type="date"
                        className="w-36"
                        value={a.due_date ?? ""}
                        onChange={(e) => {
                          const copy = [...agreements];
                          copy[i] = { ...copy[i], due_date: e.target.value };
                          setAgreements(copy);
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setAgreements(agreements.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-row">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cerrar sin check-out
                </Button>
                <Button disabled={finish.isPending} onClick={() => finish.mutate()}>
                  <Clock className="mr-1 h-4 w-4" />
                  Registrar check-out ({elapsedLabel})
                </Button>
              </DialogFooter>

            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
