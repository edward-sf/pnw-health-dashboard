import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

/**
 * Moves focus to the new page's `[data-page-heading]` when the pathname changes. The first
 * render keeps focus where the browser put it, and a URL with a hash leaves focus to the hash
 * target (`useHashFocus`). Search-only changes stay within a page and are left alone.
 *
 * If the heading isn't rendered yet (the Explorer while its data loads), it is focused as soon
 * as it appears. The wait ends on the next pathname change or unmount, so it can't move focus
 * after the user has gone elsewhere.
 */
export function useRouteFocus(): void {
  const { pathname, hash } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    if (hash) return;
    const find = () => document.querySelector<HTMLElement>("[data-page-heading]");
    const heading = find();
    if (heading) {
      heading.focus();
      return;
    }
    const observer = new MutationObserver(() => {
      const late = find();
      if (!late) return;
      observer.disconnect();
      late.focus();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, hash]);
}
