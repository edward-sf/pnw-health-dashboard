import { useCallback, useEffect, useRef, useState } from "react";

export const END_SENTINEL_ID = "methodology-end";

/**
 * Tracks which section the reader is in: the last of `ids`, in page order, whose heading is at or
 * above a line 25% of the way down the viewport. While the sentinel `#methodology-end` is on
 * screen the last id wins, so a short final section on a tall viewport still becomes current.
 * `current` is recomputed from the headings' positions each time the observed band (viewport top
 * to the line) changes, and when a pin ends, so a jump that skips the band still lands right.
 * `pin` sets `current` at once and holds it until the scroll it started ends, or the reader
 * scrolls, touches or presses a key.
 */
export function useScrollSpy(
  ids: string[],
  ready: boolean,
): { current: string | null; pin: (id: string) => void } {
  const [spy, setSpy] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const key = ids.join("|");
  const recompute = useRef<() => void>(() => {});

  useEffect(() => {
    if (!ready || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setEpoch((n) => n + 1));
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [ready]);

  useEffect(() => {
    if (!ready || typeof IntersectionObserver === "undefined") return;
    const order = key.split("|");
    let atEnd = false;
    const line = window.innerHeight * 0.25;
    const compute = () => {
      if (atEnd) return setSpy(order[order.length - 1] ?? null);
      let last: string | null = null;
      for (const id of order) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) last = id;
      }
      setSpy(last);
    };
    recompute.current = compute;

    // The band from the viewport top to the line: a heading that lands at the top after a jump
    // enters it, and one that scrolls past the line leaves it.
    const bottom = Math.max(window.innerHeight - line, 0);
    const sections = new IntersectionObserver(compute, {
      rootMargin: `0px 0px -${bottom}px 0px`,
    });
    for (const id of order) {
      const el = document.getElementById(id);
      if (el) sections.observe(el);
    }

    const end = document.getElementById(END_SENTINEL_ID);
    const sentinel = new IntersectionObserver((entries) => {
      for (const e of entries) atEnd = e.isIntersecting;
      compute();
    });
    if (end) sentinel.observe(end);
    compute();

    return () => {
      sections.disconnect();
      sentinel.disconnect();
      recompute.current = () => {};
    };
  }, [key, ready, epoch]);

  useEffect(() => {
    if (pinned === null) return;
    const release = () => {
      setPinned(null);
      recompute.current();
    };
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
