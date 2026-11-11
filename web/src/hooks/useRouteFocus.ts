import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

/**
 * Moves focus to the new page's `[data-page-heading]` when the pathname changes. The first
 * render keeps focus where the browser put it, and a URL with a hash leaves focus to the hash
 * target (`useHashFocus`). Search-only changes stay within a page and are left alone.
 */
export function useRouteFocus(): void {
  const { pathname, hash } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    if (hash) return;
    document.querySelector<HTMLElement>("[data-page-heading]")?.focus();
  }, [pathname, hash]);
}
