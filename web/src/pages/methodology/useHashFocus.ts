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
 * Once `ready`, scrolls to and focuses the element the URL hash names. Reruns on every navigation
 * (a same-URL link click gets a new `location.key`), so clicking the same link again still works.
 */
export function useHashFocus(ready: boolean): void {
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    const id = idFromHash(hash);
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    el.scrollIntoView?.();
    el.focus();
  }, [ready, hash, key]);
}
