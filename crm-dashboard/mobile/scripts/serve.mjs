// Serves www/ on http://localhost:5090 so the app can be tried in a desktop browser.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "www");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const port = Number(process.env.PORT ?? 5090);

http
  .createServer((req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    const file = path.join(root, p === "/" ? "index.html" : path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(fs.readFileSync(file));
  })
  .listen(port, () => console.log(`DAS Orders (browser preview) on http://localhost:${port}`));
