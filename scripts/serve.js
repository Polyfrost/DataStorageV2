// Usage: node scripts/serve.js [ROOT] [PORT]   (defaults: _site, 8080)
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const TYPES = {
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".sha256": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

function createServer(root) {
  const base = path.resolve(root);

  return http.createServer((req, res) => {
    let file;
    try {
      const url = new URL(req.url, "http://localhost");
      file = path.join(base, decodeURIComponent(url.pathname));
    } catch {
      res.writeHead(400).end("Bad request");
      return;
    }

    if (file !== base && !file.startsWith(base + path.sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    fs.stat(file, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404).end("Not found");
        return;
      }
      res.writeHead(200, {
        "content-type":
          TYPES[path.extname(file)] ?? "application/octet-stream",
        "content-length": stats.size,
        // Local dev: never let a client cache a bundle you just rebuilt.
        "cache-control": "no-store",
      });
      fs.createReadStream(file).pipe(res);
    });
  });
}

module.exports = { createServer };

if (require.main === module) {
  const root = process.argv[2] ?? path.join(__dirname, "..", "_site");
  const port = Number(process.argv[3] ?? 8080);
  createServer(root).listen(port, "127.0.0.1", () => {
    console.log(
      `Serving ${path.resolve(root)} on http://localhost:${port} (ctrl-c to stop)`
    );
  });
}
