// @ts-nocheck
import { cn } from "@/lib/utils";

interface GridAnimationProps {
  className?: string;
  strokeColor?: string;
  strokeWidth?: number;
  strokeLength?: number;
  spacing?: number;
}

export function GridAnimation({
  className,
  strokeColor = "#ffffff",
  strokeWidth = 1,
  strokeLength = 12,
  spacing = 28,
}: GridAnimationProps) {
  const patternId = `grid-anim-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <svg
      className={cn("pointer-events-none", className)}
      aria-hidden="true"
      style={{ opacity: 0.35 }}
    >
      <defs>
        <pattern id={patternId} width={spacing} height={spacing} patternUnits="userSpaceOnUse">
          <path
            d={`M ${spacing / 2 - strokeLength / 2} ${spacing / 2} h ${strokeLength}`}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <path
            d={`M ${spacing / 2} ${spacing / 2 - strokeLength / 2} v ${strokeLength}`}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`}>
        <animate attributeName="opacity" values="0.2;0.5;0.2" dur="6s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

export default GridAnimation;
