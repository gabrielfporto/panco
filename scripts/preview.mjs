import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../apps/web/out/", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".txt": "text/plain",
};
const base = (process.env.PANCO_BASE_PATH || "").replace(/\/$/, "");
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (base && !(url.pathname === base || url.pathname.startsWith(base + "/")))
      throw new Error();
    const path = decodeURIComponent(url.pathname.slice(base.length));
    let file = resolve(root, "." + path);
    if (!(file + sep).startsWith(root)) throw new Error();
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end("Nao encontrado");
  }
}).listen(Number(process.env.PORT || 3000), "127.0.0.1", () =>
  console.log(
    "Panco: http://127.0.0.1:" + (process.env.PORT || 3000) + base + "/",
  ),
);
