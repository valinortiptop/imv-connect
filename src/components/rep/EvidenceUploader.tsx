import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  attachVisitEvidenceFn,
  getVisitEvidenceUrlsFn,
} from "@/lib/rep.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Camera, Trash2, Upload, ImagePlus } from "lucide-react";
import SignaturePad from "./SignaturePad";

type Props = { visitId: string; userId: string };

export default function EvidenceUploader({ visitId, userId }: Props) {
  const qc = useQueryClient();
  const fetchUrls = useServerFn(getVisitEvidenceUrlsFn);
  const attach = useServerFn(attachVisitEvidenceFn);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const urlsQ = useQuery({
    queryKey: ["visit-evidence", visitId],
    queryFn: () => fetchUrls({ data: { visitId } }),
  });

  const uploadPhoto = useMutation({
    mutationFn: async (files: FileList) => {
      const paths: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${userId}/${visitId}/${crypto.randomUUID()}-photo.${ext}`;
        const { error } = await supabase.storage
          .from("rep-evidence")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (error) throw error;
        paths.push(path);
      }
      const current = (urlsQ.data?.photos ?? []).map((p: any) => p.path);
      await attach({ data: { visitId, photoPaths: [...current, ...paths] } });
    },
    onSuccess: () => {
      toast.success("Fotos subidas");
      qc.invalidateQueries({ queryKey: ["visit-evidence", visitId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error subiendo"),
    onSettled: () => setUploading(false),
  });

  const removePhoto = useMutation({
    mutationFn: async (path: string) => {
      await supabase.storage.from("rep-evidence").remove([path]);
      const remaining = (urlsQ.data?.photos ?? [])
        .map((p: any) => p.path)
        .filter((p: string) => p !== path);
      await attach({ data: { visitId, photoPaths: remaining } });
    },
    onSuccess: () => {
      toast.success("Foto eliminada");
      qc.invalidateQueries({ queryKey: ["visit-evidence", visitId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const saveSignature = useMutation({
    mutationFn: async ({ blob, name }: { blob: Blob; name: string }) => {
      const path = `${userId}/${visitId}/signature-${Date.now()}.png`;
      const { error } = await supabase.storage
        .from("rep-evidence")
        .upload(path, blob, { upsert: true, contentType: "image/png" });
      if (error) throw error;
      await attach({ data: { visitId, signaturePath: path, signedByName: name } });
    },
    onSuccess: () => {
      toast.success("Firma guardada");
      qc.invalidateQueries({ queryKey: ["visit-evidence", visitId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  useEffect(() => {
    if (uploading) return;
  }, [uploading]);

  const photos = urlsQ.data?.photos ?? [];
  const signatureUrl = urlsQ.data?.signatureUrl;
  const signedByName = urlsQ.data?.signedByName;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium">Fotos de evidencia</div>
          <div className="flex gap-1">
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  setUploading(true);
                  uploadPhoto.mutate(e.target.files);
                  e.target.value = "";
                }
              }}
            />
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
              <Camera className="mr-1 h-3.5 w-3.5" /> Cámara
            </Button>
          </div>
        </div>

        {photos.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            <ImagePlus className="mx-auto mb-1 h-6 w-6" /> Sin fotos
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {photos.map((p: any) => (
            <div key={p.path} className="group relative aspect-square overflow-hidden rounded-md border border-border">
              {p.url ? (
                <img src={p.url} alt="evidencia" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  <Upload className="h-4 w-4" />
                </div>
              )}
              <button
                onClick={() => removePhoto.mutate(p.path)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-border p-3">
        {signatureUrl ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">Firma capturada</div>
            <img src={signatureUrl} alt="firma" className="max-h-40 rounded-md border border-border bg-white" />
            {signedByName && (
              <div className="text-xs text-muted-foreground">Firmó: {signedByName}</div>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                attach({ data: { visitId, signaturePath: "", signedByName: "" } }).then(() =>
                  qc.invalidateQueries({ queryKey: ["visit-evidence", visitId] }),
                )
              }
            >
              Volver a firmar
            </Button>
          </div>
        ) : (
          <SignaturePad
            saving={saveSignature.isPending}
            onSave={(blob, name) => saveSignature.mutateAsync({ blob, name })}
          />
        )}
      </div>
    </div>
  );
}
