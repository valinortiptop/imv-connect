// @ts-nocheck
import { cn } from "@/lib/utils";
import type { ReactNode, CSSProperties } from "react";

interface LiquidMetalBorderProps {
  children: ReactNode;
  borderRadius?: number;
  borderWidth?: number;
  light?: boolean;
  className?: string;
}

export function LiquidMetalBorder({
  children,
  borderRadius = 12,
  borderWidth = 2,
  light,
  className,
}: LiquidMetalBorderProps) {
  const style: CSSProperties = {
    borderRadius,
    padding: borderWidth,
    background: light
      ? "linear-gradient(135deg, #cbd5e1, #ffffff 30%, #94a3b8 50%, #ffffff 70%, #cbd5e1)"
      : "linear-gradient(135deg, #52525b, #a1a1aa 30%, #27272a 50%, #a1a1aa 70%, #52525b)",
  };
  return (
    <div className={cn("relative inline-block w-full", className)} style={style}>
      <div style={{ borderRadius: borderRadius - borderWidth }} className="relative w-full h-full">
        {children}
      </div>
    </div>
  );
}

export default LiquidMetalBorder;
