// @ts-nocheck
import { cn } from "@/lib/utils";

interface LiquidMetalButtonProps {
  label: string;
  onClick?: () => void;
  light?: boolean;
  className?: string;
  disabled?: boolean;
}

export function LiquidMetalButton({ label, onClick, light, className, disabled }: LiquidMetalButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium transition-all overflow-hidden",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        light
          ? "bg-gradient-to-r from-slate-200 via-white to-slate-200 text-slate-800 border border-slate-300 hover:from-slate-100 hover:to-slate-100"
          : "bg-gradient-to-r from-zinc-700 via-zinc-500 to-zinc-700 text-white border border-white/20 hover:from-zinc-600 hover:to-zinc-600",
        "shadow-md hover:shadow-lg active:scale-95",
        className,
      )}
    >
      <span className="relative z-10">{label}</span>
    </button>
  );
}

export default LiquidMetalButton;
