import { useCallback, useEffect, useState } from "react";

export const END_SENTINEL_ID = "methodology-end";

const FALLBACK_HEADER_PX = 56;

/** The sticky header's height in px, read from `--header-height` (rem or px). */
function headerHeightPx(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--header-height").trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return FALLBACK_HEADER_PX;
  if (raw.endsWith("rem")) {
    return n * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
  }
  return n;
}

/**
 * Tracks which section the reader is in: the last of `ids`, in page order, whose heading has
 * reached a line 25% of the way down the viewport (below the sticky header). While the sentinel
 * `#methodology-end` is on screen the last id wins, so a short final section on a tall viewport
 * still becomes current. `pin` sets `current` at once and holds it until the scroll it started
 * ends, or the reader scrolls, touches or presses a key.
 */
export function useScrollSpy(
  ids: string[],
  ready: boolean,
): { current: string | null; pin: (id: string) => void } {
  const [spy, setSpy] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const key = ids.join("|");

  useEffect(() => {
    if (!ready || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setEpoch((n) => n + 1));
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [ready]);

  useEffect(() => {
    if (!ready || typeof IntersectionObserver === "undefined") return;
    const order = key.split("|");
    const passed = new Set<string>();
    let atEnd = false;
    const publish = () => {
      if (atEnd) return setSpy(order[order.length - 1] ?? null);
      let last: string | null = null;
      for (const id of order) if (passed.has(id)) last = id;
      setSpy(last);
    };

    const vh = window.innerHeight;
    const header = headerHeightPx();
    const top = header + vh * 0.25;
    const bottom = vh * 0.75 - header;
    const sections = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const above = e.boundingClientRect.top <= (e.rootBounds?.top ?? top);
          if (e.isIntersecting || above) passed.add(e.target.id);
          else passed.delete(e.target.id);
        }
        publish();
      },
      { rootMargin: `-${top}px 0px -${Math.max(bottom, 0)}px 0px` },
    );
    for (const id of order) {
      const el = document.getElementById(id);
      if (el) sections.observe(el);
    }

    const end = document.getElementById(END_SENTINEL_ID);
    const sentinel = new IntersectionObserver((entries) => {
      for (const e of entries) atEnd = e.isIntersecting;
      publish();
    });
    if (end) sentinel.observe(end);

    return () => {
      sections.disconnect();
      sentinel.disconnect();
    };
  }, [key, ready, epoch]);

  useEffect(() => {
    if (pinned === null) return;
    const release = () => setPinned(null);
    const events = ["wheel", "touchstart", "keydown"] as const;
    window.addEventListener("scrollend", release);
    for (const t of events) window.addEventListener(t, release, { passive: true });
    return () => {
      window.removeEventListener("scrollend", release);
      for (const t of events) window.removeEventListener(t, release);
    };
  }, [pinned]);

  const pin = useCallback((id: string) => setPinned(id), []);
  return { current: pinned ?? spy, pin };
}
