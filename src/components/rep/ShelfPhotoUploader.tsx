import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listShelfPhotosFn,
  addShelfPhotoFn,
  deleteShelfPhotoFn,
} from "@/lib/rep-visits.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Camera, Trash2, ImagePlus } from "lucide-react";

const CATEGORIES = [
  { value: "anaquel", label: "Anaquel principal" },
  { value: "exhibicion", label: "Exhibición / punta" },
  { value: "competencia", label: "Competencia" },
  { value: "precio", label: "Precio / etiqueta" },
  { value: "otro", label: "Otro" },
];

export default function ShelfPhotoUploader({
  visitId,
  clienteId,
  userId,
}: {
  visitId: string;
  clienteId?: string;
  userId: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listShelfPhotosFn);
  const addFn = useServerFn(addShelfPhotoFn);
  const delFn = useServerFn(deleteShelfPhotoFn);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [category, setCategory] = useState("anaquel");
  const [notes, setNotes] = useState("");

  const q = useQuery({
    queryKey: ["shelf-photos", visitId],
    queryFn: () => listFn({ data: { visitId } }),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${userId}/${visitId}/shelf-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("rep-evidence")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      await addFn({
        data: {
          visitId,
          clienteId,
          photoPath: path,
          category: category as any,
          notes: notes || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Foto guardada");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["shelf-photos", visitId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Foto eliminada");
      qc.invalidateQueries({ queryKey: ["shelf-photos", visitId] });
    },
  });

  const photos = q.data?.photos ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Categoría</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Notas (opcional)</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="p.ej. faltan facings"
          />
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload.mutate(f);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
        className="w-full"
      >
        <Camera className="mr-1 h-4 w-4" />
        {upload.isPending ? "Subiendo…" : "Tomar foto de anaquel"}
      </Button>

      {photos.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          <ImagePlus className="mx-auto mb-1 h-6 w-6" /> Sin fotos aún
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p: any) => (
            <div
              key={p.id}
              className="group relative aspect-square overflow-hidden rounded-md border border-border"
            >
              {p.url ? (
                <img
                  src={p.url}
                  alt={p.category}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  {p.category}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-[10px] text-white">
                {p.category}
                {p.notes ? ` · ${p.notes}` : ""}
              </div>
              <button
                onClick={() => del.mutate(p.id)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
