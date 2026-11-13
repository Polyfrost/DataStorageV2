"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const toml = require("@iarna/toml");
const { zipSync } = require("fflate");
const { loadMod, cacheKeyFor, CACHE_DIR } = require("./lib/modmeta.js");

const BUNDLES_DIR = path.join(__dirname, "..", "data", "oneclient", "bundles");
const MRPACKS_DIR = path.join(BUNDLES_DIR, ".mrpacks");
const PINS_FILE = path.join(BUNDLES_DIR, ".curseforge.json");
const OUTPUT_DIR =
  process.argv[2] || path.join(__dirname, ".cache", "curseforge");

const PACKWIZ_BIN = process.env.PACKWIZ_BIN || "packwiz";
const PACK_NAME = "OneClient";
const PACK_AUTHOR = "Polyfrost";
const LOADER = "fabric";
const SKYBLOCK_CATEGORY = "skyblock";
const IGNORED_VERSIONS = new Set(["1.8.9-ornithe"]);
const BUILTIN_IDS = new Set([
  "minecraft",
  "fabricloader",
  "fabric-loader",
  "java",
  "mixinextras",
]);
const CONCURRENCY = 8;
const ZIP_MTIME = new Date(1980, 0, 1);
const CDN = "https://edge.forgecdn.net/files";

function cdnUrl(fileID, filename) {
  return `${CDN}/${Math.floor(fileID / 1000)}/${fileID % 1000}/${encodeURIComponent(filename)}`;
}

function walk(dir, base = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, base));
    else files.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return files.sort();
}

function collect(versionDir) {
  const root = path.join(MRPACKS_DIR, versionDir);
  const categories = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => name.toLowerCase() !== SKYBLOCK_CATEGORY)
    .sort();

  let versions = null;
  const seen = new Set();
  const metas = [];
  const overrides = [];
  for (const category of categories) {
    const dir = path.join(root, category);
    if (!versions) {
      versions = toml.parse(
        fs.readFileSync(path.join(dir, "pack.toml"), "utf-8")
      ).versions;
    }
    for (const rel of walk(dir)) {
      if (rel === "pack.toml" || rel === "index.toml") continue;
      if (seen.has(rel)) continue;
      const file = path.join(dir, rel);
      if (rel.endsWith(".pw.toml")) {
        const pw = toml.parse(fs.readFileSync(file, "utf-8"));
        if (pw.enabled === false) continue;
        seen.add(rel);
        metas.push({ rel, pw });
      } else {
        seen.add(rel);
        overrides.push({ rel, file });
      }
    }
  }
  return { versions, metas, overrides };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function isMod(meta) {
  return meta.rel.startsWith("mods/") && meta.pw.filename.endsWith(".jar");
}

function packwiz(cwd, ...args) {
  return execFileSync(PACKWIZ_BIN, [...args, "-y"], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function detect(metas, versions) {
  const found = new Map();
  if (metas.length === 0) return found;

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "oneclient-curseforge-"));
  try {
    fs.writeFileSync(path.join(work, "index.toml"), 'hash-format = "sha256"\n');
    fs.writeFileSync(
      path.join(work, "pack.toml"),
      toml.stringify({
        name: PACK_NAME,
        author: PACK_AUTHOR,
        version: "1.0.0",
        "pack-format": "packwiz:1.1.0",
        index: { file: "index.toml", "hash-format": "sha256" },
        versions: { minecraft: versions.minecraft, fabric: versions.fabric },
      })
    );
    fs.mkdirSync(path.join(work, "mods"));

    const byName = new Map();
    const buffers = new Map();
    for (const meta of metas) {
      const jar = fs.readFileSync(
        path.join(CACHE_DIR, `${cacheKeyFor(meta.pw)}.jar`)
      );
      fs.writeFileSync(path.join(work, "mods", meta.pw.filename), jar);
      byName.set(meta.pw.filename, meta);
      buffers.set(meta, jar);
    }

    packwiz(work, "refresh");
    packwiz(work, "curseforge", "detect");

    const digests = new Map();
    const digest = (meta, format) => {
      const key = `${format}:${meta.rel}`;
      if (!digests.has(key)) {
        digests.set(
          key,
          crypto.createHash(format).update(buffers.get(meta)).digest("hex")
        );
      }
      return digests.get(key);
    };

    for (const name of fs.readdirSync(path.join(work, "mods"))) {
      if (!name.endsWith(".pw.toml")) continue;
      const detected = toml.parse(
        fs.readFileSync(path.join(work, "mods", name), "utf-8")
      );
      const curseforge = detected.update?.curseforge;
      if (!curseforge) continue;

      let meta = byName.get(detected.filename);
      if (!meta || fs.existsSync(path.join(work, "mods", meta.pw.filename))) {
        const format = detected.download?.["hash-format"];
        const hash = String(detected.download?.hash || "").toLowerCase();
        meta = crypto.getHashes().includes(format)
          ? metas.find(
              (m) =>
                !fs.existsSync(path.join(work, "mods", m.pw.filename)) &&
                digest(m, format) === hash
            )
          : null;
      }
      if (!meta) continue;
      found.set(meta, {
        projectID: Number(curseforge["project-id"]),
        fileID: Number(curseforge["file-id"]),
        filename: detected.filename,
      });
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  return found;
}

function dependsOf(unit, overrides) {
  const depends = { ...(unit.depends || {}) };
  const override = overrides[unit.id];
  if (!override) return Object.keys(depends);
  if (override.depends) return Object.keys(override.depends);
  for (const id of Object.keys(override["+depends"] || {})) depends[id] = "*";
  for (const id of Object.keys(override["-depends"] || {})) delete depends[id];
  return Object.keys(depends);
}

function loadDependencyOverrides(overrides) {
  const entry = overrides.find(
    (o) => o.rel === "config/fabric_loader_dependencies.json"
  );
  if (!entry) return {};
  try {
    return JSON.parse(fs.readFileSync(entry.file, "utf-8")).overrides || {};
  } catch {
    return {};
  }
}

function pruneMissingDependencies(included, loaded, dependencyOverrides) {
  const omitted = [];
  for (;;) {
    const provided = new Set(BUILTIN_IDS);
    for (const meta of included.keys()) {
      for (const provider of loaded.get(meta)?.providers || []) {
        provided.add(provider.id);
      }
    }
    const broken = [];
    for (const meta of included.keys()) {
      const primary = loaded.get(meta)?.primary;
      if (!primary) continue;
      const missing = dependsOf(primary, dependencyOverrides).filter(
        (id) => !provided.has(id)
      );
      if (missing.length > 0) broken.push({ meta, missing });
    }
    if (broken.length === 0) return omitted;
    for (const { meta, missing } of broken) {
      included.delete(meta);
      omitted.push({ meta, reason: `requires ${missing.join(", ")}` });
    }
  }
}

async function buildPack(versionDir, pins) {
  const { versions, metas, overrides } = collect(versionDir);
  if (!versions) {
    console.warn(
      `Warning: no non-SkyBlock categories for ${versionDir}, skipping`
    );
    return;
  }
  if (!versions.minecraft || !versions.fabric) {
    throw new Error(`could not read minecraft/fabric version for ${versionDir}`);
  }

  const mods = metas.filter(isMod);
  const loaded = new Map();
  const results = await mapLimit(mods, CONCURRENCY, (meta) => loadMod(meta.pw));
  mods.forEach((meta, i) => loaded.set(meta, results[i]));

  const failed = mods.filter(
    (meta) =>
      !fs.existsSync(path.join(CACHE_DIR, `${cacheKeyFor(meta.pw)}.jar`))
  );
  if (failed.length > 0) {
    throw new Error(
      `could not download ${failed.length} file(s) for ${versionDir}:\n` +
        failed
          .map((meta) => `  ${loaded.get(meta).warnings.join("; ")}`)
          .join("\n")
    );
  }

  const included = new Map();
  const pending = [];
  const omitted = [];
  for (const meta of metas) {
    const pin = pins[meta.pw.update?.modrinth?.version];
    if (pin) {
      included.set(meta, {
        projectID: pin.projectID,
        fileID: pin.fileID,
        filename: pin.name,
      });
    } else if (!isMod(meta)) {
      omitted.push({ meta, reason: "not a mod jar and not pinned" });
    } else {
      pending.push(meta);
    }
  }

  const detected = detect(pending, versions);
  for (const meta of pending) {
    if (detected.has(meta)) included.set(meta, detected.get(meta));
    else omitted.push({ meta, reason: "file not found on CurseForge" });
  }

  omitted.push(
    ...pruneMissingDependencies(
      included,
      loaded,
      loadDependencyOverrides(overrides)
    )
  );

  const manifest = {
    minecraft: {
      version: versions.minecraft,
      modLoaders: [{ id: `${LOADER}-${versions.fabric}`, primary: true }],
    },
    manifestType: "minecraftModpack",
    manifestVersion: 1,
    name: PACK_NAME,
    version: "1.0.0",
    author: PACK_AUTHOR,
    files: [...included.values()]
      .sort((a, b) => a.projectID - b.projectID || a.fileID - b.fileID)
      .map(({ projectID, fileID }) => ({ projectID, fileID, required: true })),
    overrides: "overrides",
  };

  const entries = {
    "manifest.json": [
      Buffer.from(JSON.stringify(manifest, null, 2)),
      { mtime: ZIP_MTIME },
    ],
  };
  const sortedOverrides = [...overrides].sort((a, b) =>
    a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0
  );
  for (const { rel, file } of sortedOverrides) {
    entries[`overrides/${rel}`] = [fs.readFileSync(file), { mtime: ZIP_MTIME }];
  }

  const report = omitted
    .map(({ meta, reason }) => ({
      name: meta.pw.name,
      filename: meta.pw.filename,
      modrinth: meta.pw.update?.modrinth?.["mod-id"] || null,
      reason,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const index = {
    formatVersion: 1,
    game: "minecraft",
    versionId: "1.0.0",
    name: `${PACK_NAME} (CurseForge)`,
    dependencies: {
      minecraft: versions.minecraft,
      "fabric-loader": versions.fabric,
    },
    files: [...included.entries()]
      .map(([meta, file]) => ({
        path: `${path.posix.dirname(meta.rel)}/${file.filename}`,
        hashes: {},
        downloads: [cdnUrl(file.fileID, file.filename)],
      }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  };
  const launchEntries = {
    "modrinth.index.json": [
      Buffer.from(JSON.stringify(index, null, 2)),
      { mtime: ZIP_MTIME },
    ],
  };
  for (const [name, entry] of Object.entries(entries)) {
    if (name !== "manifest.json") launchEntries[name] = entry;
  }

  const base = path.join(OUTPUT_DIR, `oneclient-${versionDir}`);
  fs.writeFileSync(`${base}.zip`, Buffer.from(zipSync(entries)));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `oneclient-curseforge-${versionDir}.mrpack`),
    Buffer.from(zipSync(launchEntries))
  );
  fs.writeFileSync(`${base}.omitted.json`, JSON.stringify(report, null, 2));

  console.log(
    `Bundled ${PACK_NAME} (${versions.minecraft}) -> ${base}.zip: ` +
      `${included.size}/${metas.length} files, ${report.length} omitted`
  );
  for (const entry of report) {
    console.log(`  omitted ${entry.name} (${entry.filename}): ${entry.reason}`);
  }
}

async function main() {
  const pins = fs.existsSync(PINS_FILE)
    ? JSON.parse(fs.readFileSync(PINS_FILE, "utf-8")).pins || {}
    : {};

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const versionDirs = fs
    .readdirSync(MRPACKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => !IGNORED_VERSIONS.has(name.toLowerCase()))
    .filter((name) => name.endsWith(`-${LOADER}`))
    .sort();

  for (const versionDir of versionDirs) {
    await buildPack(versionDir, pins);
  }

  console.log(`Done. CurseForge modpacks written to ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
