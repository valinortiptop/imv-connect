import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
  /** If true, filters wrap on mobile instead of horizontal scroll. */
  stack?: boolean;
};

export function FilterBar({ children, className, stack }: Props) {
  if (stack) {
    return (
      <div className={cn("mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", className)}>
        {children}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "mb-3 -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0",
        className
      )}
    >
      {children}
    </div>
  );
}
