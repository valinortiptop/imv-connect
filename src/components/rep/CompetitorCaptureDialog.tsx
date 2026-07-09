import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createCompetitorMigrationFn } from "@/lib/rep-behavior.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UserMinus } from "lucide-react";

export default function CompetitorCaptureDialog({
  clienteId,
  laboratorioId,
  laboratorioNombre,
  trigger,
}: {
  clienteId: string;
  laboratorioId?: string | null;
  laboratorioNombre?: string | null;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [competitor, setCompetitor] = useState("");
  const [motivo, setMotivo] = useState("");
  const qc = useQueryClient();
  const submit = useServerFn(createCompetitorMigrationFn);

  const m = useMutation({
    mutationFn: () =>
      submit({
        data: {
          clienteId,
          laboratorioId: laboratorioId ?? null,
          competitorName: competitor.trim(),
          motivo: motivo.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Registrado");
      qc.invalidateQueries({ queryKey: ["competitor-migrations"] });
      qc.invalidateQueries({ queryKey: ["competitive-landscape"] });
      setCompetitor("");
      setMotivo("");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <UserMinus className="mr-1.5 h-3.5 w-3.5" />
            ¿A quién le compra ahora?
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar migración a competencia</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {laboratorioNombre && (
            <div className="rounded border border-border bg-muted/40 p-2 text-xs">
              Laboratorio: <span className="font-medium">{laboratorioNombre}</span>
            </div>
          )}
          <div>
            <Label htmlFor="competitor">Distribuidor / competencia</Label>
            <Input
              id="competitor"
              placeholder="p.ej. Ramasa, Provet, etc."
              value={competitor}
              onChange={(e) => setCompetitor(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="motivo">Motivo (opcional)</Label>
            <Textarea
              id="motivo"
              rows={3}
              placeholder="Precio, plazo, disponibilidad, relación…"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => m.mutate()}
            disabled={!competitor.trim() || m.isPending}
          >
            {m.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
