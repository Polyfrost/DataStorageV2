"use strict";

/**
 * Extract the `fabric.mod.json` metadata of a mod jar (via its packwiz `.pw.toml`
 * download url) — including nested "jar-in-jar" (JiJ) mods, which is how e.g. Fabric
 * API provides all its `fabric-*` modules. Jars already in the local cache are read
 * from disk; otherwise only the needed zip entries are fetched with HTTP range requests.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { PassThrough } = require("node:stream");
const unzipper = require("unzipper");

const CACHE_DIR = path.join(__dirname, "..", ".cache", "jars");
// Covers the central directory (and often fabric.mod.json itself) of most mod jars.
const TAIL_BYTES = 64 * 1024;

/** Derive a stable, immutable cache key from a packwiz mod entry. */
function cacheKeyFor(pwMod) {
  // Modrinth CDN urls look like .../data/<proj>/versions/<versionId>/<file>.jar
  const url = pwMod?.download?.url || "";
  const m = url.match(/\/versions\/([^/]+)\//);
  if (m) return m[1];
  // Fall back to the file hash (also immutable), else a hash of the url.
  if (pwMod?.download?.hash) return String(pwMod.download.hash).slice(0, 40);
  return crypto.createHash("sha1").update(url).digest("hex");
}

/**
 * Escape raw control characters (U+0000–U+001F) that appear *inside* string
 * literals. Fabric's Gson-based loader accepts unescaped newlines/tabs in e.g.
 * `description`, but strict JSON.parse rejects them ("Bad control character in
 * string literal"). We escape them so those (valid, working) mods still parse.
 */
function escapeControlCharsInStrings(s) {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) {
      out += c;
      esc = false;
      continue;
    }
    if (inStr) {
      if (c === "\\") {
        out += c;
        esc = true;
        continue;
      }
      if (c === '"') {
        inStr = false;
        out += c;
        continue;
      }
      const code = s.charCodeAt(i);
      if (code < 0x20) {
        if (c === "\n") out += "\\n";
        else if (c === "\r") out += "\\r";
        else if (c === "\t") out += "\\t";
        else out += "\\u" + code.toString(16).padStart(4, "0");
        continue;
      }
      out += c;
    } else {
      if (c === '"') inStr = true;
      out += c;
    }
  }
  return out;
}

/** Strip // and /* *\/ comments and trailing commas, then JSON.parse. */
function parseLenientJson(text) {
  // Remove BOM.
  let s = text.replace(/^﻿/, "");
  // Escape raw control chars inside strings (structural whitespace untouched).
  s = escapeControlCharsInStrings(s);
  // Strip block comments.
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");
  // Strip line comments (naive: not inside strings — acceptable for mod metadata).
  s = s.replace(/(^|[^:"'\\])\/\/[^\n\r]*/g, "$1");
  // Remove trailing commas before } or ].
  s = s.replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(s);
}

/** Fetch `url` (retrying 429/5xx/network errors) and read the whole body. */
async function fetchBytes(url, init) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow", ...init });
      if (res.ok) return { res, body: Buffer.from(await res.arrayBuffer()) };
      const err = new Error(`download failed (${res.status}) for ${url}`);
      err.permanent = res.status !== 429 && res.status < 500;
      throw err;
    } catch (e) {
      if (e.permanent || attempt === 4) {
        throw "permanent" in e ? e : new Error(`download failed (${e.message}) for ${url}`);
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

/**
 * An `unzipper.Open.custom` source reading a remote zip through range requests.
 * unzipper drops errors of source streams, so a failed fetch ends its stream early
 * and is recorded in `error` instead.
 */
function remoteSource(url) {
  let total, tail, tailStart;
  // bytes [start, end) of the file
  const range = async (start, end) => {
    const { body } = await fetchBytes(url, { headers: { range: `bytes=${start}-${end - 1}` } });
    if (body.length !== end - start) throw new Error(`download failed (range not honored) for ${url}`);
    return body;
  };
  const source = {
    error: null,
    // Modrinth's CDN rejects suffix ranges (`bytes=-N`), hence the separate HEAD
    async size() {
      try {
        const { res } = await fetchBytes(url, { method: "HEAD" });
        total = Number(res.headers.get("content-length"));
        if (!total) throw new Error(`download failed (no content-length) for ${url}`);
        tailStart = Math.max(0, total - TAIL_BYTES);
        tail = await range(tailStart, total);
        return total;
      } catch (e) {
        throw (source.error ??= e);
      }
    },
    stream(offset, length) {
      const out = new PassThrough();
      const end = length ? Math.min(offset + length, total) : total;
      if (offset >= tailStart) {
        out.end(tail.subarray(offset - tailStart, end - tailStart));
      } else {
        range(offset, end).then(
          (body) => out.end(body),
          (e) => {
            source.error ??= e;
            out.end();
          }
        );
      }
      return out;
    },
  };
  return source;
}

/** Download the whole jar into the cache, verified against the `.pw.toml` hash. */
async function ensureCached(pwMod) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const key = cacheKeyFor(pwMod);
  const dest = path.join(CACHE_DIR, `${key}.jar`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    return fs.readFileSync(dest);
  }

  const url = pwMod?.download?.url;
  if (!url) throw new Error(`no download url for ${pwMod?.filename || key}`);

  const buf = (await fetchBytes(url)).body;

  // Verify integrity against the hash pinned in the .pw.toml (sha512/sha256/sha1).
  const fmt = (pwMod.download["hash-format"] || "sha512").replace(/-/g, "");
  const expected = pwMod.download.hash;
  if (expected) {
    const actual = crypto.createHash(fmt).update(buf).digest("hex");
    if (actual.toLowerCase() !== String(expected).toLowerCase()) {
      throw new Error(
        `hash mismatch for ${pwMod.filename}: expected ${fmt} ${expected}, got ${actual}`
      );
    }
  }

  fs.writeFileSync(dest, buf);
  return buf;
}

/** Normalize a raw fabric.mod.json object into the fields we resolve against. */
function normalizeUnit(fmj) {
  const rel = (v) => (v && typeof v === "object" ? v : {});
  const provides = Array.isArray(fmj.provides) ? fmj.provides : [];
  return {
    id: fmj.id,
    version: typeof fmj.version === "string" ? fmj.version : "0.0.0",
    provides,
    depends: rel(fmj.depends),
    recommends: rel(fmj.recommends),
    suggests: rel(fmj.suggests),
    breaks: rel(fmj.breaks),
    conflicts: rel(fmj.conflicts),
    environment: fmj.environment || "*",
    jars: Array.isArray(fmj.jars) ? fmj.jars : [],
  };
}

/**
 * Recursively read fabric.mod.json out of an opened jar (`unzipper.Open.*`),
 * collecting the top-level unit and every nested JiJ unit.
 */
async function readUnitsFromJar(open, label, warnings, depth = 0) {
  const units = [];
  let entries;
  try {
    entries = new Map((await open).files.map((f) => [f.path, f]));
  } catch (e) {
    warnings.push(`${label}: could not unzip (${e.message})`);
    return units;
  }

  const fmj = entries.get("fabric.mod.json");
  if (!fmj) {
    // Not a Fabric mod (e.g. a plain library jar or Quilt-only). Only warn at top level.
    if (depth === 0) warnings.push(`${label}: no fabric.mod.json (skipped)`);
    return units;
  }

  let unit;
  try {
    unit = normalizeUnit(parseLenientJson((await fmj.buffer()).toString("utf-8")));
  } catch (e) {
    warnings.push(`${label}: invalid fabric.mod.json (${e.message})`);
    return units;
  }
  units.push(unit);

  // Recurse nested jars (jar-in-jar).
  for (const j of unit.jars) {
    const nestedEntry = j && j.file ? entries.get(j.file) : null;
    if (!nestedEntry) continue;
    let nestedBuf;
    try {
      nestedBuf = await nestedEntry.buffer();
    } catch (e) {
      warnings.push(`${label}!${j.file}: could not unzip (${e.message})`);
      continue;
    }
    const nested = await readUnitsFromJar(
      unzipper.Open.buffer(nestedBuf),
      `${label}!${j.file}`,
      warnings,
      depth + 1
    );
    for (const n of nested) units.push(n);
  }
  return units;
}

/**
 * Load a single packwiz mod and extract all Fabric units, from the jar cache when
 * present (see `ensureCached`), otherwise remotely.
 * @returns {Promise<{primary: object|null, providers: {id:string,version:string}[], warnings: string[]}>}
 */
async function loadMod(pwMod) {
  const warnings = [];
  const label = pwMod.filename || pwMod.id || "<unknown>";
  const cached = path.join(CACHE_DIR, `${cacheKeyFor(pwMod)}.jar`);
  const url = pwMod.download?.url;
  let remote = null;
  if (!fs.existsSync(cached)) {
    if (!url) return { primary: null, providers: [], warnings: [`${label}: no download url`] };
    remote = remoteSource(url);
  }

  const units = await readUnitsFromJar(
    remote ? unzipper.Open.custom(remote) : unzipper.Open.file(cached),
    label,
    warnings
  );
  // whatever unzipper made of a truncated read, the cause is the failed download
  if (remote?.error) return { primary: null, providers: [], warnings: [`${label}: ${remote.error.message}`] };
  if (units.length === 0) return { primary: null, providers: [], warnings };

  // The top-level unit is the actual installed mod; its relations are enforced.
  const primary = units[0];

  // Every unit (top-level + nested) contributes providers: its own id and each
  // `provides` alias (aliases inherit the declaring unit's version).
  const providers = [];
  for (const u of units) {
    if (u.id) providers.push({ id: u.id, version: u.version });
    for (const p of u.provides) {
      if (typeof p === "string") providers.push({ id: p, version: u.version });
      else if (p && p.id) providers.push({ id: p.id, version: p.version || u.version });
    }
  }

  return { primary, providers, warnings };
}

module.exports = { loadMod, ensureCached, cacheKeyFor, parseLenientJson, CACHE_DIR };
