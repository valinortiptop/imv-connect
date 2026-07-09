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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { checkInFn, checkOutFn } from "@/lib/rep.functions";
import { toast } from "sonner";
import { MapPin, Plus, Trash2 } from "lucide-react";
import OrderQuickCreate from "./OrderQuickCreate";
import EvidenceUploader from "./EvidenceUploader";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteId: string;
  clienteNombre: string;
};

export default function CheckInDialog({ open, onOpenChange, clienteId, clienteNombre }: Props) {
  const qc = useQueryClient();
  const doCheckIn = useServerFn(checkInFn);
  const doCheckOut = useServerFn(checkOutFn);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [step, setStep] = useState<"start" | "in-visit">("start");
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState<string>("");
  const [agreements, setAgreements] = useState<{ description: string; due_date?: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    setStep("start");
    setVisitId(null);
    setNotes("");
    setOutcome("");
    setAgreements([]);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setGeo(null),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    }
  }, [open]);

  const startVisit = useMutation({
    mutationFn: () =>
      doCheckIn({
        data: { clienteId, lat: geo?.lat, lng: geo?.lng },
      }),
    onSuccess: (r: any) => {
      setVisitId(r.visit.id);
      setStep("in-visit");
      toast.success("Check-in registrado");
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const finish = useMutation({
    mutationFn: () =>
      doCheckOut({
        data: {
          visitId: visitId!,
          lat: geo?.lat,
          lng: geo?.lng,
          notes: notes || undefined,
          outcome: (outcome || undefined) as any,
          agreements: agreements.filter((a) => a.description.trim().length > 0),
        },
      }),
    onSuccess: () => {
      toast.success("Visita finalizada");
      qc.invalidateQueries({ queryKey: ["client-visits", clienteId] });
      qc.invalidateQueries({ queryKey: ["rep-visits"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{step === "start" ? "Iniciar visita" : "Finalizar visita"}</DialogTitle>
          <DialogDescription>{clienteNombre}</DialogDescription>
        </DialogHeader>

        {step === "start" && (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {geo
                  ? `Ubicación: ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}`
                  : "Sin acceso a ubicación (opcional)"}
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button disabled={startVisit.isPending} onClick={() => startVisit.mutate()}>
                Registrar check-in
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "in-visit" && (
          <div className="space-y-3">
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
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cerrar</Button>
              <Button disabled={finish.isPending} onClick={() => finish.mutate()}>
                Finalizar visita
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
