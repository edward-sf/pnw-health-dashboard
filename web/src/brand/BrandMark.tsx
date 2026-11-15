import { cn } from "@/lib/utils";

/**
 * The mark: a mint mountain with a snow notch and a sun, on a 24-unit grid. It sits on the fir
 * header, so it is drawn for a dark surface.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-6", className)}>
      <path d="M2 20.5 9.5 6l4 7 2.5-4 6 11.5Z" fill="var(--focus-on-fir)" />
      <path d="M9.5 6 7 10.9l1.9-.9 1.5 1.5 1.1-1.6 1 1.7Z" fill="var(--header-ink)" />
      {/* The sun is mark-only: it is not a token and never appears in the interface or charts. */}
      <circle cx="18.5" cy="5.5" r="2.4" fill="#f2c46d" />
    </svg>
  );
}
