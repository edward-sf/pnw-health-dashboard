import { useCallback, useSyncExternalStore } from "react";

export const PHONE_QUERY = "(max-width: 720px)";

const supported = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

/** Whether `query` matches now, rerendering when it changes. False where matchMedia is missing. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supported()) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => supported() && window.matchMedia(query).matches,
    () => false,
  );
}
