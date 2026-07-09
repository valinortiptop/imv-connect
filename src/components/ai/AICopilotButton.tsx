import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useAI } from "./AIProvider";
import { AICopilotDrawer } from "./AICopilotDrawer";

export function AICopilotButton() {
  const { enabled } = useAI();
  const [open, setOpen] = useState(false);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir asistente IA"
        className="fixed bottom-20 right-5 z-40 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-primary/20 hover:scale-105 transition-transform md:bottom-5"
      >
        <Sparkles className="h-5 w-5" />
      </button>
      <AICopilotDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
