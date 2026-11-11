/* Classic script (no modules): loaded by 404.html and index.html. */
(function (root) {
  "use strict";

  // Turn a 404 location into a redirect URL: base + "?p=" + the path below base.
  function encode(location, base) {
    var path = location.pathname;
    if (path.indexOf(base) === 0) {
      path = "/" + path.slice(base.length);
    }
    return (
      base +
      "?p=" +
      encodeURIComponent(path + location.search + location.hash)
    );
  }

  // Recover the URL to restore from "?p=...", or null if absent or unsafe.
  function decode(search, base) {
    var p = new URLSearchParams(search).get("p");
    if (p === null || p.charAt(0) !== "/") return null;
    if (p.charAt(1) === "/" || p.charAt(1) === "\\") return null;
    return base.replace(/\/$/, "") + p;
  }

  root.spaRedirect = { encode: encode, decode: decode };
})(globalThis);
