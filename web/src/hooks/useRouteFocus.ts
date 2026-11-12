import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router";

/**
 * Moves focus to the new page's `[data-page-heading]` when the pathname changes. The first
 * render keeps focus where the browser put it, and a URL with a hash leaves focus to the hash
 * target (`useHashFocus`). Search-only changes stay within a page and are left alone.
 *
 * If the heading isn't rendered yet (the Explorer while its data loads), it is focused as soon
 * as it appears, unless the user has moved focus in the meantime (focus left on `<body>`, for
 * example because its element was removed, still moves). The wait ends on the next pathname or
 * hash change, or on unmount.
 *
 * A layout effect, so a navigation's cleanup runs in the same commit that changes the DOM. The
 * observer's records are queued by that commit and `disconnect()` drops them, so a leftover wait
 * can't take the next page's heading. A passive effect's cleanup can run after the observer's
 * microtask when React Router renders the navigation in a transition.
 */
export function useRouteFocus(): void {
  const { pathname, hash } = useLocation();
  const previous = useRef(pathname);
  useLayoutEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    if (hash) return;
    const find = () => document.querySelector<HTMLElement>("[data-page-heading]");
    const heading = find();
    if (heading) {
      heading.focus();
      return;
    }
    // Where focus was at navigation time. If the user moves it while the page loads, the late
    // heading leaves it there.
    const before = document.activeElement;
    const observer = new MutationObserver(() => {
      const late = find();
      if (!late) return;
      observer.disconnect();
      const now = document.activeElement;
      if (now === null || now === document.body || now === before) late.focus();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, hash]);
}
