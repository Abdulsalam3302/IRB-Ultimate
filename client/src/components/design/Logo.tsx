import { cn } from "@/lib/utils";

type Props = {
  size?: number;
  withText?: boolean;
  tone?: "forest" | "cream";
  className?: string;
};

/** Stamped Tick + IRB·Ultimate wordmark from design system v0.2 */
export function Logo({ size = 28, withText = true, tone = "forest", className }: Props) {
  const fg = tone === "cream" ? "#faf9f6" : "#064e3b";
  const tick = "#10b981";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)} aria-label="IRB Ultimate">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <g transform="rotate(-8 16 16)">
          <rect x="4.5" y="4.5" width="23" height="23" rx="2.5" stroke={fg} strokeWidth="2" />
        </g>
        <path
          d="M9.5 16.5l4.5 4.5 9-10"
          stroke={tick}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      {withText && (
        <span className="font-display font-bold text-[15px] tracking-tight" style={{ color: fg }}>
          IRB<span style={{ color: tick }}>·</span>Ultimate
        </span>
      )}
    </span>
  );
}
