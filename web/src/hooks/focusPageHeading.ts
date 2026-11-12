const find = () => document.querySelector<HTMLElement>("[data-page-heading]");

/**
 * Focuses the page's `[data-page-heading]`, now or as soon as it renders (the Explorer while its
 * data loads). A late heading takes focus only if focus is still on `before` (where it was when
 * the wait began) or has fallen back to `<body>`, so it never takes focus the user has moved.
 * Returns a function that cancels the wait.
 */
export function focusPageHeadingWhenReady(before: Element | null): () => void {
  const heading = find();
  if (heading) {
    heading.focus();
    return () => {};
  }
  const observer = new MutationObserver(() => {
    const late = find();
    if (!late) return;
    observer.disconnect();
    const now = document.activeElement;
    if (now === null || now === document.body || now === before) late.focus();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
