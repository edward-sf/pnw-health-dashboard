/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The site's origin, for absolute social-card URLs. Defaults to the GitHub Pages origin. */
  readonly VITE_SITE_ORIGIN?: string;
}
