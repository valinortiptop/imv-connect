import * as React from "react";
import { cn } from "@/lib/utils";

interface GlowCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const GlowCard = React.forwardRef<HTMLDivElement, GlowCardProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("glow-card-wrapper rounded-xl p-[1.5px]", className)}
        {...props}
      >
        <div className="glow-card-inner rounded-xl bg-card h-full">
          {children}
        </div>
      </div>
    );
  }
);
GlowCard.displayName = "GlowCard";

export { GlowCard };
