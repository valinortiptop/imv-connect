import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listMyProspectsFn,
  createProspectFn,
} from "@/lib/rep-prospects.functions";
import AIPageInsights from "@/components/ai/AIPageInsights";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, MapPin, Phone, User } from "lucide-react";
import { toast } from "sonner";

function ProspectsPage() {
  const listFn = useServerFn(listMyProspectsFn);
  const createFn = useServerFn(createProspectFn);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    contact_person: "",
    direccion: "",
    colonia: "",
    municipio: "",
    notes: "",
  });

  const q = useQuery({
    queryKey: ["rep-prospects"],
    queryFn: () => listFn({ data: {} }),
  });

  useEffect(() => {
    if (!open || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeo(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [open]);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          ...form,
          lat: geo?.lat,
          lng: geo?.lng,
        },
      }),
    onSuccess: () => {
      toast.success("Prospecto capturado");
      setOpen(false);
      setForm({
        name: "",
        phone: "",
        contact_person: "",
        direccion: "",
        colonia: "",
        municipio: "",
        notes: "",
      });
      qc.invalidateQueries({ queryKey: ["rep-prospects"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const prospects = q.data?.prospects ?? [];

  return (
    <div className="space-y-4">
      <AIPageInsights module="rep-prospectos" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Prospectos</h1>
          <p className="text-xs text-muted-foreground">
            Captura clientes potenciales en campo
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Nuevo prospecto
        </Button>
      </div>

      {q.isLoading && (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      )}

      {!q.isLoading && prospects.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Aún no tienes prospectos capturados.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {prospects.map((p: any) => (
          <Card key={p.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <Badge variant="secondary" className="capitalize">
                  {p.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              {p.contact_person && (
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" /> {p.contact_person}
                </div>
              )}
              {p.phone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  <a href={`tel:${p.phone}`} className="underline">
                    {p.phone}
                  </a>
                </div>
              )}
              {(p.direccion || p.colonia || p.municipio) && (
                <div className="flex items-start gap-1">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    {[p.direccion, p.colonia, p.municipio]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              )}
              {p.notes && <p className="pt-1 text-foreground/80">{p.notes}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo prospecto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre del negocio *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Contacto</Label>
                <Input
                  value={form.contact_person}
                  onChange={(e) =>
                    setForm({ ...form, contact_person: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Dirección</Label>
              <Input
                value={form.direccion}
                onChange={(e) =>
                  setForm({ ...form, direccion: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Colonia</Label>
                <Input
                  value={form.colonia}
                  onChange={(e) =>
                    setForm({ ...form, colonia: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Municipio</Label>
                <Input
                  value={form.municipio}
                  onChange={(e) =>
                    setForm({ ...form, municipio: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              <MapPin className="mr-1 inline h-3 w-3" />
              {geo
                ? `Ubicación: ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}`
                : "Sin acceso a ubicación (opcional)"}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!form.name || create.isPending}
              onClick={() => create.mutate()}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/rep/prospectos")({
  component: ProspectsPage,
});
