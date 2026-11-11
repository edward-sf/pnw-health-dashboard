import { useEffect } from "react";

/** Sets `document.title` while the calling page is shown. */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
