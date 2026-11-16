export const SITE_NAME = "PNW Health Atlas";
export const TAGLINE = "County health across Washington, Oregon, Idaho and Alaska.";

/** The document title for a page: the site name, or `<page> · <site name>`. */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${SITE_NAME}` : SITE_NAME;
}

/** Where the site is served from, for absolute social-card URLs. */
export function siteOrigin(): string {
  return import.meta.env.VITE_SITE_ORIGIN ?? "https://edward-sf.github.io";
}
