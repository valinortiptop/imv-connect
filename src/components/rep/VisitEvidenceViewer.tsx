// Visor de evidencia de una visita (fotos, firma y fotos de anaquel).
// Solo lectura: lo usa el supervisor al revisar el detalle de una ruta.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getVisitEvidenceUrlsFn } from "@/lib/rep.functions";
import { listShelfPhotosFn } from "@/lib/rep-visits.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Camera, ImageOff } from "lucide-react";

export default function VisitEvidenceViewer({
  visitId,
  clienteNombre,
  open,
  onOpenChange,
}: {
  visitId: string | null;
  clienteNombre?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const fetchEvidence = useServerFn(getVisitEvidenceUrlsFn);
  const fetchShelf = useServerFn(listShelfPhotosFn);

  const evidenceQ = useQuery({
    queryKey: ["visit-evidence", visitId],
    queryFn: () => fetchEvidence({ data: { visitId: visitId! } }),
    enabled: open && !!visitId,
  });

  const shelfQ = useQuery({
    queryKey: ["shelf-photos", visitId],
    queryFn: () => fetchShelf({ data: { visitId: visitId! } }),
    enabled: open && !!visitId,
  });

  const photos: any[] = evidenceQ.data?.photos ?? [];
  const shelf: any[] = shelfQ.data?.photos ?? [];
  const signatureUrl = evidenceQ.data?.signatureUrl ?? null;
  const loading = evidenceQ.isLoading || shelfQ.isLoading;
  const empty = !loading && photos.length === 0 && shelf.length === 0 && !signatureUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col overflow-x-hidden">
        <DialogHeader className="pr-8 text-left sm:text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">Evidencia de la visita</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {clienteNombre ?? "Fotos, firma y anaquel capturados en campo"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 flex-1 space-y-4 overflow-y-auto">
          {loading && <p className="text-sm text-muted-foreground">Cargando evidencia…</p>}

          {empty && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              <ImageOff className="mx-auto mb-1 h-6 w-6" />
              Esta visita no tiene evidencia registrada.
            </div>
          )}

          {photos.length > 0 && (
            <section className="space-y-2">
              <p className="text-sm font-medium">Fotos de evidencia ({photos.length})</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {photos.map((p) =>
                  p.url ? (
                    <a
                      key={p.path}
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block aspect-square overflow-hidden rounded-md border"
                    >
                      <img src={p.url} alt="Evidencia de visita" className="h-full w-full object-cover" />
                    </a>
                  ) : (
                    <div
                      key={p.path}
                      className="flex aspect-square items-center justify-center rounded-md border text-[11px] text-muted-foreground"
                    >
                      No disponible
                    </div>
                  ),
                )}
              </div>
            </section>
          )}

          {shelf.length > 0 && (
            <section className="space-y-2">
              <p className="text-sm font-medium">Fotos de anaquel ({shelf.length})</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {shelf.map((p) => (
                  <div key={p.id} className="relative aspect-square overflow-hidden rounded-md border">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer">
                        <img src={p.url} alt={p.category} className="h-full w-full object-cover" />
                      </a>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
                        No disponible
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-[10px] text-white">
                      {p.category}
                      {p.notes ? ` · ${p.notes}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {signatureUrl && (
            <section className="space-y-2">
              <p className="text-sm font-medium">Firma del cliente</p>
              <img
                src={signatureUrl}
                alt="Firma del cliente"
                className="max-h-40 w-full rounded-md border bg-white object-contain"
              />
              {evidenceQ.data?.signedByName && (
                <p className="text-xs text-muted-foreground">Firmó: {evidenceQ.data.signedByName}</p>
              )}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
