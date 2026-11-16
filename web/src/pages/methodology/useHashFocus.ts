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
 */
export function useHashFocus(ready: boolean): void {
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    const id = idFromHash(hash);
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    for (let d = el.parentElement?.closest("details"); d; d = d.parentElement?.closest("details")) {
      d.open = true;
    }
    el.scrollIntoView?.();
    el.focus();
  }, [ready, hash, key]);
}
