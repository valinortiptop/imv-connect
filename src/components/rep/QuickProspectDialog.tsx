import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressAutocomplete, type ResolvedAddress } from "@/components/ui/address-autocomplete";
import { createProspectFn } from "@/lib/rep-prospects.functions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Se llama con el prospecto recién creado (p.ej. para hacer check-in de inmediato). */
  onCreated?: (prospect: { id: string; name: string }) => void;
};

/** Alta rápida de prospecto desde el campo: nombre + dirección con Google Places. */
export default function QuickProspectDialog({ open, onOpenChange, onCreated }: Props) {
  const createProspect = useServerFn(createProspectFn);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addr, setAddr] = useState<ResolvedAddress | null>(null);
  const [addrText, setAddrText] = useState("");

  const reset = () => {
    setName("");
    setPhone("");
    setAddr(null);
    setAddrText("");
  };

  const save = useMutation({
    mutationFn: () =>
      createProspect({
        data: {
          name: name.trim(),
          phone: phone.trim() || undefined,
          direccion: addr?.address ?? undefined,
          lat: addr?.lat ?? undefined,
          lng: addr?.lng ?? undefined,
          place_id: addr?.place_id ?? undefined,
          source: "visita_campo",
        },
      }),
    onSuccess: (r: any) => {
      toast.success("Prospecto creado");
      reset();
      onOpenChange(false);
      onCreated?.({ id: r.prospect.id, name: r.prospect.name });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo crear el prospecto"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Nuevo prospecto</DialogTitle>
          <DialogDescription className="text-xs">
            Registra el negocio que estás visitando. La dirección se completa con Google.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qp-name">Nombre del negocio *</Label>
            <Input
              id="qp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Abarrotes La Esquina"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qp-phone">Teléfono</Label>
            <Input
              id="qp-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="55 1234 5678"
              inputMode="tel"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Dirección (Google)</Label>
            <AddressAutocomplete
              value={addrText}
              onChange={(v) => {
                setAddrText(v);
                setAddr(null);
              }}
              onSelect={(r) => {
                setAddr(r);
                setAddrText(r.address);
              }}
              placeholder="Buscar dirección o negocio…"
            />
            {addr && (
              <p className="text-[11px] text-muted-foreground">
                {addr.address}
                {addr.lat != null && addr.lng != null ? " · con ubicación" : ""}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Guardar prospecto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
