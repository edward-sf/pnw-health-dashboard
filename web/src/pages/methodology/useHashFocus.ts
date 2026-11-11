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

/** Once `ready`, scrolls to and focuses the element the URL hash names; reruns when the hash changes. */
export function useHashFocus(ready: boolean): void {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    const id = idFromHash(hash);
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    el.scrollIntoView?.();
    el.focus();
  }, [ready, hash]);
}
