import { cn } from "@/lib/utils";
import { PLATFORM } from "@shared/branding";

type Props = {
  size?: number;
  withText?: boolean;
  tone?: "forest" | "cream";
  className?: string;
};

/** Stamped Tick + IRB Saudi Arabia wordmark */
export function Logo({ size = 28, withText = true, tone = "forest", className }: Props) {
  const fg = tone === "cream" ? "#faf9f6" : "#064e3b";
  const tick = "#10b981";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)} aria-label={PLATFORM.nameEn}>
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
        <span className="font-display font-bold text-[14px] leading-tight tracking-tight" style={{ color: fg }}>
          IRB
          <span className="block text-[11px] font-semibold opacity-80">Saudi Arabia</span>
        </span>
      )}
    </span>
  );
}
