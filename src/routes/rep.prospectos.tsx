import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listMyProspectsFn,
  createProspectFn,
} from "@/lib/rep-prospects.functions";
import {
  googlePlacesAutocompleteFn,
  googlePlaceEnrichFn,
} from "@/lib/valinor.functions";
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
import { Plus, MapPin, Phone, User, Search, Sparkles, Loader2, Star, Globe } from "lucide-react";
import { toast } from "sonner";

const emptyForm = {
  name: "",
  phone: "",
  contact_person: "",
  direccion: "",
  colonia: "",
  municipio: "",
  notes: "",
};

type Enrichment = {
  place_id: string;
  website: string | null;
  google_maps_url: string | null;
  rating: number | null;
  review_count: number | null;
  business_status: string | null;
  primary_type: string | null;
  price_level: number | string | null;
  opening_hours: string[] | null;
  description: string | null;
};

function ProspectsPage() {
  const listFn = useServerFn(listMyProspectsFn);
  const createFn = useServerFn(createProspectFn);
  const autocompleteFn = useServerFn(googlePlacesAutocompleteFn);
  const enrichFn = useServerFn(googlePlaceEnrichFn);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [enrichment, setEnrichment] = useState<Enrichment | null>(null);

  // Google search
  const [gQuery, setGQuery] = useState("");
  const [gLoading, setGLoading] = useState(false);
  const [gEnriching, setGEnriching] = useState(false);
  const [gResults, setGResults] = useState<
    Array<{ place_id: string; main: string; secondary: string }>
  >([]);
  const [session, setSession] = useState(() =>
    Math.random().toString(36).slice(2),
  );

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

  // Debounced Google autocomplete
  useEffect(() => {
    if (!open) return;
    const q = gQuery.trim();
    if (q.length < 3) {
      setGResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setGLoading(true);
      try {
        const resp: any = await autocompleteFn({
          data: {
            query: q,
            sessiontoken: session,
            country: "mx",
            language: "es",
          },
        });
        setGResults(
          (resp?.predictions ?? []).map((p: any) => ({
            place_id: p.place_id,
            main: p.structured_formatting?.main_text ?? p.description,
            secondary: p.structured_formatting?.secondary_text ?? "",
          })),
        );
      } catch (e) {
        console.warn("autocomplete failed", e);
      } finally {
        setGLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [gQuery, open, session, autocompleteFn]);

  const pickPlace = async (placeId: string) => {
    setGResults([]);
    setGEnriching(true);
    const tid = toast.loading("Enriqueciendo con Google Places…");
    try {
      const resp: any = await enrichFn({
        data: { place_id: placeId, sessiontoken: session, language: "es" },
      });
      const e = resp?.enrichment;
      if (!e) throw new Error("Sin datos");
      setForm((f) => ({
        ...f,
        name: e.name ?? f.name,
        phone: e.phone ?? f.phone,
        direccion: e.direccion ?? f.direccion,
        colonia: e.colonia ?? f.colonia,
        municipio: e.municipio ?? f.municipio,
        notes: [f.notes, e.description].filter(Boolean).join("\n\n").trim(),
      }));
      if (typeof e.lat === "number" && typeof e.lng === "number") {
        setGeo({ lat: e.lat, lng: e.lng });
      }
      setEnrichment({
        place_id: e.place_id,
        website: e.website,
        google_maps_url: e.google_maps_url,
        rating: e.rating,
        review_count: e.user_ratings_total,
        business_status: e.business_status,
        primary_type: e.primary_type,
        price_level: e.price_level,
        opening_hours: e.opening_hours,
        description: e.description,
      });
      setGQuery(e.name ?? "");
      setSession(Math.random().toString(36).slice(2));
      toast.success("Datos completados desde Google", { id: tid });
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo enriquecer", { id: tid });
    } finally {
      setGEnriching(false);
    }
  };

  const resetAll = () => {
    setForm(emptyForm);
    setEnrichment(null);
    setGQuery("");
    setGResults([]);
    setGeo(null);
  };

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          ...form,
          lat: geo?.lat,
          lng: geo?.lng,
          ...(enrichment
            ? {
                place_id: enrichment.place_id,
                website: enrichment.website ?? undefined,
                google_maps_url: enrichment.google_maps_url ?? undefined,
                rating: enrichment.rating ?? undefined,
                review_count: enrichment.review_count ?? undefined,
                business_status: enrichment.business_status ?? undefined,
                primary_type: enrichment.primary_type ?? undefined,
                price_level: enrichment.price_level ?? undefined,
                opening_hours: enrichment.opening_hours ?? undefined,
                description: enrichment.description ?? undefined,
              }
            : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Prospecto capturado");
      setOpen(false);
      resetAll();
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
