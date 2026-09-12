import Link from "next/link";
import { cn } from "@/lib/utils";

/** Logo mark: a treble-clef-inspired note inside a gold ring. */
export function LogoMark({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <circle cx="24" cy="24" r="22" fill="#7a2e3f" />
      <circle cx="24" cy="24" r="22" fill="none" stroke="#c9a24d" strokeWidth="2" />
      <circle cx="24" cy="24" r="18.5" fill="none" stroke="#c9a24d" strokeWidth="0.75" opacity="0.6" />
      {/* eighth note */}
      <ellipse cx="19.5" cy="31" rx="5" ry="3.6" transform="rotate(-20 19.5 31)" fill="#fbf7f0" />
      <rect x="23.4" y="12" width="2.2" height="19.5" rx="1" fill="#fbf7f0" />
      <path d="M25.6 12c4 1.2 7.5 4 7.2 8.6-.1 1.8-.9 3.2-2 4.3 1.1-3.4-.9-6.2-5.2-7.5V12z" fill="#c9a24d" />
    </svg>
  );
}

export function Wordmark({ className, light = false, compact = false }: { className?: string; light?: boolean; compact?: boolean }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-3", className)}>
      <LogoMark size={compact ? 34 : 44} />
      <span className="leading-tight">
        <span className={cn("font-display block text-lg font-semibold tracking-tight", compact && "text-base", light ? "text-ivory" : "text-ink")}>Senior Music Connection</span>
        {!compact ? <span className={cn("block text-[11px] font-semibold uppercase tracking-[0.28em]", light ? "text-gold-300" : "text-gold-700")}>Live music, matched with care</span> : null}
      </span>
    </Link>
  );
}

/** Decorative musical staff with drifting notes for hero sections. Purely ornamental. */
export function MusicMotif({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 220" aria-hidden="true" className={cn("h-auto w-full", className)} fill="none">
      <defs>
        <linearGradient id="staffFade" x1="0" x2="1">
          <stop offset="0" stopColor="#7a2e3f" stopOpacity="0" />
          <stop offset="0.2" stopColor="#7a2e3f" stopOpacity="0.35" />
          <stop offset="0.8" stopColor="#7a2e3f" stopOpacity="0.35" />
          <stop offset="1" stopColor="#7a2e3f" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[70, 92, 114, 136, 158].map((y) => (
        <path key={y} d={`M0 ${y} C 160 ${y - 18}, 320 ${y + 18}, 640 ${y}`} stroke="url(#staffFade)" strokeWidth="1.2" />
      ))}
      {/* treble clef, simplified */}
      <path d="M62 178c-14 0-22-9-22-19 0-9 6-16 14-16 7 0 12 5 12 11 0 5-4 9-9 9-4 0-7-3-7-6 0 0 2 3 6 3 3 0 5-2 5-5 0-4-3-7-8-7-6 0-11 5-11 12 0 8 7 14 17 14 12 0 21-9 21-21 0-8-4-14-10-21-8-9-14-16-14-27 0-12 9-25 16-30 4 6 6 13 6 20 0 11-8 20-16 28M66 40c-2 22 6 42 8 66 1 12 2 22 3 31" stroke="#7a2e3f" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
      {/* notes */}
      <g fill="#7a2e3f" opacity="0.9">
        <ellipse cx="200" cy="126" rx="9" ry="6.5" transform="rotate(-20 200 126)" />
        <rect x="207.5" y="90" width="2.4" height="37" rx="1" />
        <ellipse cx="280" cy="104" rx="9" ry="6.5" transform="rotate(-20 280 104)" />
        <rect x="287.5" y="68" width="2.4" height="37" rx="1" />
        <ellipse cx="330" cy="92" rx="9" ry="6.5" transform="rotate(-20 330 92)" />
        <rect x="337.5" y="56" width="2.4" height="37" rx="1" />
        <path d="M289.5 68 L339.5 56 L339.5 62 L289.5 74 Z" />
        <ellipse cx="430" cy="138" rx="9" ry="6.5" transform="rotate(-20 430 138)" />
        <rect x="437.5" y="102" width="2.4" height="37" rx="1" />
        <path d="M440 102c8 2 14 8 13 16-.2 3-1.6 5.5-3.6 7.4 2-6-1.6-10.8-9.4-13V102z" fill="#c9a24d" />
        <ellipse cx="520" cy="114" rx="9" ry="6.5" transform="rotate(-20 520 114)" />
        <rect x="527.5" y="78" width="2.4" height="37" rx="1" />
        <ellipse cx="575" cy="126" rx="9" ry="6.5" transform="rotate(-20 575 126)" fill="none" stroke="#7a2e3f" strokeWidth="2.2" />
        <rect x="582.5" y="90" width="2.4" height="37" rx="1" />
      </g>
      <g fill="#c9a24d" opacity="0.8">
        <circle cx="150" cy="40" r="3" />
        <circle cx="470" cy="34" r="2.2" />
        <circle cx="600" cy="60" r="2.6" />
      </g>
    </svg>
  );
}

/** Small ornamental divider. */
export function NoteDivider({ className }: { className?: string }) {
  return (
    <div className={cn("divider-note my-8", className)} aria-hidden="true">
      <span className="text-lg">♪</span>
    </div>
  );
}
