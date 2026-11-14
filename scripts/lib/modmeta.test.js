"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const { zipSync, strToU8 } = require("fflate");
const { loadMod } = require("./modmeta.js");

const fmj = (obj) => strToU8(JSON.stringify(obj));

// fabric.mod.json first, then incompressible filler, so its entry lies outside
// the fetched tail and needs its own range request.
const jar = Buffer.from(
  zipSync({
    "fabric.mod.json": fmj({
      id: "outer",
      version: "1.0.0",
      jars: [{ file: "META-INF/jars/inner.jar" }],
    }),
    "META-INF/jars/inner.jar": zipSync({ "fabric.mod.json": fmj({ id: "inner", version: "2.0.0" }) }),
    "filler.bin": [crypto.randomBytes(256 * 1024), { level: 0 }],
  })
);

async function serve(t, honorRange) {
  const server = http.createServer((req, res) => {
    const m = honorRange && /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || "");
    const body = m ? jar.subarray(Number(m[1]), Number(m[2]) + 1) : jar;
    res.writeHead(m ? 206 : 200, { "content-length": body.length });
    res.end(req.method === "HEAD" ? undefined : body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  // a fresh version id, so a local jar cache never short-circuits the remote read
  return `http://127.0.0.1:${server.address().port}/versions/${crypto.randomUUID()}/mod.jar`;
}

test("reads fabric.mod.json and nested jars through range requests", async (t) => {
  const url = await serve(t, true);
  const res = await loadMod({ filename: "mod.jar", download: { url } });
  assert.deepEqual(res.warnings, []);
  assert.equal(res.primary.id, "outer");
  assert.deepEqual(res.providers, [
    { id: "outer", version: "1.0.0" },
    { id: "inner", version: "2.0.0" },
  ]);
});

test("a server ignoring Range is a download failure, not a parse error", async (t) => {
  const url = await serve(t, false);
  const res = await loadMod({ filename: "mod.jar", download: { url } });
  assert.equal(res.primary, null);
  assert.match(res.warnings.join("\n"), /download failed/);
});
