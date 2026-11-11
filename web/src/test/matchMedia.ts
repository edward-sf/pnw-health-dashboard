type Listener = (e: MediaQueryListEvent) => void;

/**
 * Installs a `window.matchMedia` whose every query reports `matches`. `set` changes it and fires
 * the `change` listeners. `setup.ts` removes it after each test.
 */
export function mockMatchMedia(initial: boolean): { set(matches: boolean): void } {
  let matches = initial;
  const listeners = new Set<Listener>();
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, l: Listener) => listeners.add(l),
      removeEventListener: (_type: string, l: Listener) => listeners.delete(l),
      addListener: (l: Listener) => listeners.add(l),
      removeListener: (l: Listener) => listeners.delete(l),
      dispatchEvent: () => true,
    }) as unknown as MediaQueryList;
  return {
    set(next: boolean) {
      matches = next;
      for (const l of [...listeners]) l({ matches } as MediaQueryListEvent);
    },
  };
}

export function resetMatchMedia() {
  // jsdom has no matchMedia; put it back that way.
  delete (window as { matchMedia?: unknown }).matchMedia;
}
