import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
};

/** Mono uppercase pill — NBCE badges, section labels */
export function Stamp({ children, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1 rounded-full",
        "bg-forest-900/[0.04] text-forest-900 text-[12px] font-mono uppercase tracking-[0.16em]",
        "ring-1 ring-forest-900/10",
        className,
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-jade-500" />
      {children}
    </span>
  );
}
