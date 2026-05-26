// @ts-nocheck
import { cn } from "@/lib/utils";

export function LumaSpin({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-[65px] aspect-square pointer-events-none", className)}>
      <span className="absolute inset-0 rounded-full bg-transparent luma-box luma-anim" />
    </div>
  );
}
