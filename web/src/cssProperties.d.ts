import "react";

// Custom properties set through React's `style` prop, typed here so callers need no cast.
declare module "react" {
  interface CSSProperties {
    /** A county's outline, from `outlineFor`; read by the `.county` rule in styles.css. */
    "--county-stroke"?: string;
  }
}
