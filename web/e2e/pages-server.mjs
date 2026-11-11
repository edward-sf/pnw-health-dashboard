// A static server that answers like GitHub Pages, for e2e/pages404.spec.ts:
//   node e2e/pages-server.mjs <distDir> <port>
// Files under /pnw-health-dashboard/ are served from distDir (a directory serves its
// index.html). Anything else, including paths that resolve outside distDir, gets status 404
// with the body of distDir/404.html. No dependencies.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const BASE = "/pnw-health-dashboard/";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".topojson": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const [distArg, portArg] = process.argv.slice(2);
if (!distArg || !portArg) {
  console.error("usage: node e2e/pages-server.mjs <distDir> <port>");
  process.exit(2);
}
const root = resolve(distArg);
const notFound = await readFile(resolve(root, "404.html"));

async function fileFor(urlPath) {
  if (!urlPath.startsWith(BASE)) return null;
  let rel;
  try {
    rel = decodeURIComponent(urlPath.slice(BASE.length));
  } catch {
    return null;
  }
  const target = resolve(root, rel);
  if (target !== root && !target.startsWith(root + sep)) return null;
  try {
    const info = await stat(target);
    if (info.isFile()) return target;
    if (info.isDirectory()) {
      const index = resolve(target, "index.html");
      if ((await stat(index)).isFile()) return index;
    }
  } catch {
    // Missing file: fall through to the 404 page.
  }
  return null;
}

createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const file = await fileFor(path);
  if (file) {
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(await readFile(file));
  } else {
    res.writeHead(404, { "content-type": TYPES[".html"] });
    res.end(notFound);
  }
}).listen(Number(portArg), () => {
  console.log(`pages-server: ${root} on http://localhost:${portArg}${BASE}`);
});
