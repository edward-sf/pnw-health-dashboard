import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router";
import { focusPageHeadingWhenReady } from "./focusPageHeading";

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
    return focusPageHeadingWhenReady(document.activeElement);
  }, [pathname, hash]);
}
