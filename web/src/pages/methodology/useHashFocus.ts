import { useEffect } from "react";
import { useLocation } from "react-router";

function idFromHash(hash: string): string {
  const raw = hash.replace(/^#/, "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Once `ready`, opens any folds around, then scrolls to and focuses the element the URL hash names. Reruns on every navigation
 * (a same-URL link click gets a new `location.key`), so clicking the same link again still works.
 * `smooth` picks smooth scrolling; pass false for readers who prefer reduced motion.
 */
export function useHashFocus(ready: boolean, smooth = false): void {
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    const id = idFromHash(hash);
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    for (let d = el.parentElement?.closest("details"); d; d = d.parentElement?.closest("details")) {
      d.open = true;
    }
    el.scrollIntoView?.({ behavior: smooth ? "smooth" : "auto" });
    el.focus();
    // `smooth` is read at navigation time only; changing it alone must not rescroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hash, key]);
}
