import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eraser, Check } from "lucide-react";

type Props = {
  onSave: (blob: Blob, signedByName: string) => Promise<void> | void;
  saving?: boolean;
};

export default function SignaturePad({ onSave, saving }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [name, setName] = useState("");
  const [hasStrokes, setHasStrokes] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const { x, y } = pos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStrokes(true);
  };
  const end = () => (drawing.current = false);

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasStrokes(false);
  };

  const save = async () => {
    const c = canvasRef.current!;
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
    await onSave(blob, name.trim());
    clear();
    setName("");
  };

  return (
    <div className="space-y-2">
      <div>
        <Label>Firma del cliente</Label>
        <div className="mt-1 rounded-md border border-border bg-white">
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            className="block h-40 w-full touch-none rounded-md"
          />
        </div>
      </div>
      <div>
        <Label>Nombre de quien firma</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre completo" />
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={clear} disabled={!hasStrokes}>
          <Eraser className="mr-1 h-3.5 w-3.5" /> Limpiar
        </Button>
        <Button
          size="sm"
          disabled={!hasStrokes || !name.trim() || saving}
          onClick={save}
        >
          <Check className="mr-1 h-3.5 w-3.5" /> Guardar firma
        </Button>
      </div>
    </div>
  );
}
