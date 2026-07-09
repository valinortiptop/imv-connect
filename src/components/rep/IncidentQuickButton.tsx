import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createQuickIncidentFn } from "@/lib/rep-behavior.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Mic } from "lucide-react";
import { toast } from "sonner";

const TYPES = [
  { value: "queja", label: "Queja" },
  { value: "faltante", label: "Faltante" },
  { value: "competencia", label: "Competencia" },
  { value: "cobranza", label: "Cobranza" },
  { value: "otro", label: "Otro" },
] as const;

type Tipo = (typeof TYPES)[number]["value"];

export default function IncidentQuickButton({ clienteId }: { clienteId?: string }) {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<Tipo>("faltante");
  const [descripcion, setDescripcion] = useState("");
  const [recording, setRecording] = useState(false);
  const submit = useServerFn(createQuickIncidentFn);

  const m = useMutation({
    mutationFn: () =>
      submit({ data: { clienteId: clienteId ?? null, tipo, descripcion: descripcion.trim() } }),
    onSuccess: () => {
      toast.success("Incidencia registrada");
      setDescripcion("");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const startDictation = () => {
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      toast.error("Dictado no soportado en este navegador");
      return;
    }
    const rec = new SR();
    rec.lang = "es-MX";
    rec.continuous = false;
    rec.interimResults = false;
    setRecording(true);
    rec.onresult = (e: any) => {
      const text = Array.from(e.results as any)
        .map((r: any) => r[0].transcript)
        .join(" ");
      setDescripcion((prev) => (prev ? `${prev} ${text}` : text));
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    rec.start();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg hover:opacity-90 md:bottom-6"
        aria-label="Registrar incidencia"
      >
        <AlertTriangle className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar incidencia</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTipo(t.value)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      tipo === t.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="desc">Descripción</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={startDictation}
                  disabled={recording}
                >
                  <Mic className={`mr-1 h-3.5 w-3.5 ${recording ? "text-red-600" : ""}`} />
                  {recording ? "Escuchando…" : "Dictar"}
                </Button>
              </div>
              <Textarea
                id="desc"
                rows={4}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="¿Qué sucedió?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => m.mutate()}
              disabled={!descripcion.trim() || m.isPending}
            >
              {m.isPending ? "Guardando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
