import { Sparkles, EyeOff } from "lucide-react";
import { useAI } from "./AIProvider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function AIToggle({ compact = false }: { compact?: boolean }) {
  const { enabled, setEnabled } = useAI();

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setEnabled(!enabled)}
        title={enabled ? "Desactivar IA" : "Activar IA"}
        className="flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary"
      >
        {enabled ? (
          <>
            <span className="grid h-4 w-4 place-items-center rounded-full bg-primary/15">
              <Sparkles className="h-2.5 w-2.5 text-primary" />
            </span>
            <span className="hidden md:inline">IA</span>
          </>
        ) : (
          <>
            <EyeOff className="h-3 w-3" />
            <span className="hidden md:inline">IA off</span>
          </>
        )}
      </button>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="space-y-1">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" /> Asistente IA
        </Label>
        <p className="text-xs text-muted-foreground max-w-md">
          Activa o desactiva el asistente IA en todo el panel. Al desactivar se oculta el copiloto flotante.
          Los datos siguen funcionando igual.
        </p>
        <p className="text-[11px] text-muted-foreground">
          Modelo: <span className="font-mono">gemini-2.5-flash</span> vía Valinor · sólo lectura.
        </p>
      </div>
      <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Activar IA" />
    </div>
  );
}
