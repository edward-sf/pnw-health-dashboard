import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInThisContext } from "node:vm";
import { beforeAll, expect, test } from "vitest";

interface Loc {
  pathname: string;
  search: string;
  hash: string;
}
interface SpaRedirect {
  encode(location: Loc, base: string): string;
  decode(search: string, base: string): string | null;
}

let spaRedirect: SpaRedirect;
beforeAll(() => {
  const src = readFileSync(
    resolve(process.cwd(), "public/spa-redirect.js"),
    "utf8",
  );
  runInThisContext(src);
  spaRedirect = (globalThis as unknown as { spaRedirect: SpaRedirect })
    .spaRedirect;
});

const base = "/pnw-health-dashboard/";
const loc = (pathname: string, search = "", hash = ""): Loc => ({
  pathname,
  search,
  hash,
});

test("round-trips path, query and hash", () => {
  const url = spaRedirect.encode(
    loc(base + "methodology", "?a=1&b=2", "#sources"),
    base,
  );
  expect(spaRedirect.decode(url.slice(url.indexOf("?")), base)).toBe(
    base + "methodology?a=1&b=2#sources",
  );
});

test("encode keeps the leading slash in p", () => {
  expect(spaRedirect.encode(loc(base + "methodology", "?a=1"), base)).toBe(
    base + "?p=" + encodeURIComponent("/methodology?a=1"),
  );
});

test("no p param gives null", () =>
  expect(spaRedirect.decode("?i=x", base)).toBeNull());

test("a protocol-relative p is refused", () =>
  expect(
    spaRedirect.decode("?p=" + encodeURIComponent("//evil.example"), base),
  ).toBeNull());
