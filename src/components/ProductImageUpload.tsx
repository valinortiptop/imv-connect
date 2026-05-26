import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Image as ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 6 * 1024 * 1024; // 6 MB
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"] as const;

interface Props {
  currentUrl: string | null;
  pendingFile: File | null;
  onFile: (file: File | null) => void;
  markForRemoval?: boolean;
  onMarkForRemoval?: (remove: boolean) => void;
  height?: "md" | "lg";
  className?: string;
}

export function ProductImageUpload({
  currentUrl,
  pendingFile,
  onFile,
  markForRemoval,
  onMarkForRemoval,
  height = "lg",
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const previewUrl = useMemo(() => {
    if (!pendingFile) return null;
    return URL.createObjectURL(pendingFile);
  }, [pendingFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const displayUrl = previewUrl || (!markForRemoval ? currentUrl : null);

  const validate = (file: File): string | null => {
    if (!ACCEPTED.includes(file.type as (typeof ACCEPTED)[number])) {
      return "Formato no soportado (usa PNG, JPG o WEBP)";
    }
    if (file.size > MAX_BYTES) {
      return `Archivo demasiado grande (máx 6 MB). Este pesa ${(file.size / 1024 / 1024).toFixed(1)} MB`;
    }
    return null;
  };

  const handleFile = (file: File) => {
    const err = validate(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onFile(file);
    if (onMarkForRemoval) onMarkForRemoval(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const boxHeight = height === "lg" ? "h-[260px] md:h-[300px]" : "h-[180px]";

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "relative rounded-xl border-2 border-dashed transition-colors flex items-center justify-center overflow-hidden",
          boxHeight,
          dragActive ? "border-primary bg-primary/10" : "border-border bg-background",
          !displayUrl && "cursor-pointer hover:border-primary hover:bg-muted/30",
        )}
        onClick={() => {
          if (!displayUrl) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        {displayUrl ? (
          <img src={displayUrl} alt="" className="max-h-full max-w-full object-contain p-4" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-center px-4 py-6">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Haz clic o arrastra una imagen
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG o WEBP · máximo 6 MB
              </p>
            </div>
          </div>
        )}
        {displayUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFile(null);
              if (currentUrl && onMarkForRemoval) onMarkForRemoval(true);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
            aria-label="Quitar imagen"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => inputRef.current?.click()}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          {displayUrl ? "Cambiar imagen" : "Subir imagen"}
        </Button>
        {pendingFile && (
          <span className="text-[11px] text-muted-foreground truncate">
            {pendingFile.name} · {(pendingFile.size / 1024 / 1024).toFixed(2)} MB
          </span>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
