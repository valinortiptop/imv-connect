// @ts-nocheck
import { cn } from "@/lib/utils";

interface AILoaderProps {
  size?: number;
  centerImage?: string;
  centerImageAlt?: string;
  className?: string;
}

export function AILoader({ size = 120, centerImage, centerImageAlt = "", className }: AILoaderProps) {
  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-0 rounded-full border-2 border-transparent border-t-white/70 border-r-white/30 animate-spin"
        style={{ animationDuration: "1.6s" }}
      />
      <div
        className="absolute rounded-full border-2 border-transparent border-b-white/50 border-l-white/20 animate-spin"
        style={{ inset: "10%", animationDuration: "2.4s", animationDirection: "reverse" }}
      />
      {centerImage ? (
        <img
          src={centerImage}
          alt={centerImageAlt}
          className="relative rounded-full object-cover"
          style={{ width: size * 0.6, height: size * 0.6 }}
        />
      ) : (
        <div
          className="relative rounded-full bg-white/10"
          style={{ width: size * 0.4, height: size * 0.4 }}
        />
      )}
    </div>
  );
}

export default AILoader;
