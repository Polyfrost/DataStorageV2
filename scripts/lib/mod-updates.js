"use strict";

const path = require("node:path");
const toml = require("@iarna/toml");

const MRPACKS = "data/oneclient/bundles/.mrpacks";
const MODRINTH_API = "https://api.modrinth.com/v2";
const USER_AGENT = "Polyfrost/DataStorageV2 (changelog)";
const BATCH_SIZE = 100;
const LOADERS = ["fabric", "quilt", "ornithe", "forge", "neoforge", "babric", "legacy-fabric"];

function minecraftOf(file) {
  const folder = file.slice(MRPACKS.length + 1).split("/")[0];
  return folder.replace(/-[a-z-]+$/, "");
}

function compareMinecraft(a, b) {
  const pa = a.split(/[.-]/).map((part) => Number(part) || 0);
  const pb = b.split(/[.-]/).map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

function readBlobs(git, specs) {
  if (specs.length === 0) return [];
  const out = git(["cat-file", "--batch"], specs.join("\n") + "\n");
  const results = [];
  let offset = 0;
  for (let i = 0; i < specs.length; i++) {
    const end = out.indexOf(10, offset);
    const header = out.subarray(offset, end).toString("utf8");
    offset = end + 1;
    const match = header.match(/^\S+ \S+ (\d+)$/);
    if (!match) {
      results.push(null);
      continue;
    }
    const size = Number(match[1]);
    results.push(out.subarray(offset, offset + size).toString("utf8"));
    offset += size + 1;
  }
  return results;
}

function parseToml(text) {
  if (text == null) return null;
  try {
    return toml.parse(text);
  } catch {
    return null;
  }
}

function stateOf(parsed) {
  return {
    filename: parsed.filename ?? null,
    versionId: parsed.update?.modrinth?.version ?? null,
    tag: parsed.update?.github?.tag ?? null,
  };
}

function collectChanges(git, from, to, mrpacks = MRPACKS) {
  const files = git(["diff", "--no-renames", "--name-status", from, to, "--", mrpacks])
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"))
    .filter(([status, file]) => status === "M" && file.endsWith(".pw.toml"))
    .map(([, file]) => file);

  const blobs = readBlobs(
    git,
    files.flatMap((file) => [`${from}:${file}`, `${to}:${file}`])
  );

  const changes = [];
  files.forEach((file, index) => {
    const before = parseToml(blobs[index * 2]);
    const after = parseToml(blobs[index * 2 + 1]);
    if (!before || !after || !after.name) return;
    const a = stateOf(before);
    const b = stateOf(after);
    if (a.filename === b.filename && a.versionId === b.versionId && a.tag === b.tag) return;
    const projectId = after.update?.modrinth?.["mod-id"] ?? null;
    changes.push({
      file,
      minecraft: minecraftOf(file),
      key: projectId ?? `name:${after.name}`,
      projectId,
      slugHint: path.posix.basename(file).replace(/\.pw\.toml$/, ""),
      name: after.name,
      before: a,
      after: b,
    });
  });
  return changes;
}

function versionIdsOf(changes) {
  const ids = new Set();
  for (const change of changes) {
    if (change.before.versionId) ids.add(change.before.versionId);
    if (change.after.versionId) ids.add(change.after.versionId);
  }
  return [...ids];
}

async function fetchModrinthVersions(ids, { fetchImpl = fetch, userAgent = USER_AGENT } = {}) {
  const versions = new Map();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const url = `${MODRINTH_API}/versions?ids=${encodeURIComponent(JSON.stringify(batch))}`;
    const response = await fetchImpl(url, { headers: { "User-Agent": userAgent } });
    if (!response.ok) {
      throw new Error(`Modrinth answered ${response.status} for ${batch.length} versions.`);
    }
    for (const version of await response.json()) {
      versions.set(version.id, {
        id: version.id,
        projectId: version.project_id,
        versionNumber: version.version_number,
        changelog: version.changelog ?? "",
        datePublished: version.date_published ?? null,
        gameVersions: version.game_versions ?? [],
      });
    }
  }
  return versions;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanVersion(raw, gameVersions = []) {
  let text = String(raw).trim().replace(/^v(?=\d)/i, "");
  const plus = text.indexOf("+");
  if (plus > 0) {
    const head = text.slice(0, plus).replace(/^mc/i, "");
    text = gameVersions.includes(head) ? text.slice(plus + 1).replace(/\+.*$/, "") : text.slice(0, plus);
  }
  const minecraft = [...gameVersions]
    .sort((a, b) => b.length - a.length)
    .map((version) => `${escapeRegex(version)}(?:\\.0)?`)
    .join("|");
  const token = [
    "mc\\d+(?:\\.\\d+)*(?:\\.x)?",
    "\\d+(?:\\.\\d+)*\\.x",
    ...LOADERS.map(escapeRegex),
    ...(minecraft ? [minecraft] : []),
  ].join("|");
  const trailing = new RegExp(`[-_](?:${token})$`, "i");
  const leading = new RegExp(`^(?:${token})[-_](?=v?\\d|mc\\d|${LOADERS.map(escapeRegex).join("|")})`, "i");
  let previous;
  do {
    previous = text;
    text = text.replace(trailing, "").replace(leading, "");
  } while (text !== previous && text);
  text = text.replace(/^v(?=\d)/i, "");
  return text || String(raw).trim();
}

function versionFromFilename(filename, slugHint) {
  if (!filename) return null;
  const stem = filename.replace(/\.(jar|zip)$/i, "");
  const match = stem.match(/[-_+]v?(\d[\w.+-]*)$/) ?? stem.match(/[-_]v?(\d.*)$/);
  if (match) return match[1];
  return stem.toLowerCase().startsWith(`${slugHint}`.toLowerCase())
    ? stem.slice(slugHint.length).replace(/^[-_+]/, "") || stem
    : stem;
}

function describe(state, change, versions) {
  const version = state.versionId ? versions.get(state.versionId) : null;
  if (version) {
    return {
      raw: version.versionNumber,
      clean: cleanVersion(version.versionNumber, version.gameVersions),
      date: version.datePublished,
      version,
    };
  }
  const raw = state.tag ?? versionFromFilename(state.filename, change.slugHint) ?? state.filename;
  const minecraft = change.minecraft.split(".");
  const gameVersions = minecraft.map((_, i) => minecraft.slice(0, i + 1).join(".")).filter((v) => v.includes("."));
  return { raw, clean: cleanVersion(raw, gameVersions), date: null, version: null };
}

function compareLoose(a, b) {
  const pa = a.split(/[^0-9]+/).filter(Boolean).map(Number);
  const pb = b.split(/[^0-9]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (diff) return diff;
  }
  return 0;
}

function isDowngrade(from, to) {
  if (from.date && to.date) return Date.parse(to.date) < Date.parse(from.date);
  return compareLoose(to.clean, from.clean) < 0;
}

function joinList(items) {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function mentioned(name, bullets) {
  const needles = [...new Set([name, name.replace(/\s*\([^)]*\)\s*$/, "")])]
    .filter(Boolean)
    .map((needle) => new RegExp(`^- (?:Updated|Changed) ${escapeRegex(needle)}(?=\\s+(?:to|from|on|and)\\b|[.,]|$)`, "i"));
  return bullets.some((bullet) => needles.some((needle) => needle.test(bullet)));
}

function buildUpdateBullets(changes, versions = new Map(), { priorities = {}, priorityFor, exclude = [] } = {}) {
  const mods = new Map();
  for (const change of changes) {
    const from = describe(change.before, change, versions);
    const to = describe(change.after, change, versions);
    if (from.raw === to.raw) continue;
    let mod = mods.get(change.key);
    if (!mod) {
      mod = { key: change.key, entries: [], weight: 0, name: change.name, nameMinecraft: change.minecraft };
      mods.set(change.key, mod);
    }
    if (compareMinecraft(change.minecraft, mod.nameMinecraft) > 0) {
      mod.name = change.name;
      mod.nameMinecraft = change.minecraft;
    }
    if (priorityFor) {
      const { value } = priorityFor(change, priorities);
      mod.weight = Math.max(mod.weight, value);
    }
    mod.entries.push({ minecraft: change.minecraft, from, to });
  }

  const bullets = [];
  for (const mod of mods.values()) {
    if (mentioned(mod.name, exclude)) continue;

    const groups = new Map();
    for (const entry of mod.entries) {
      const collapses = entry.from.clean === entry.to.clean;
      const fromText = collapses ? null : entry.from.clean;
      const toText = entry.to.clean;
      const downgrade = !collapses && isDowngrade(entry.from, entry.to);
      const groupKey = JSON.stringify([fromText, toText, downgrade]);
      let group = groups.get(groupKey);
      if (!group) {
        group = { fromText, toText, downgrade, minecraft: new Set(), newest: entry };
        groups.set(groupKey, group);
      }
      group.minecraft.add(entry.minecraft);
      if (compareMinecraft(entry.minecraft, group.newest.minecraft) > 0) group.newest = entry;
    }

    const scoped = groups.size > 1;
    const lines = [...groups.values()]
      .map((group) => ({
        group,
        minecraft: [...group.minecraft].sort(compareMinecraft),
      }))
      .sort((a, b) => compareMinecraft(a.minecraft[0], b.minecraft[0]));
    for (const { group, minecraft } of lines) {
      const verb = group.downgrade ? "Changed" : "Updated";
      const scope = scoped ? ` on ${joinList(minecraft)}` : "";
      const version = group.newest.to.version;
      const link = version && version.changelog.trim()
        ? ` ([Changelog](https://modrinth.com/project/${version.projectId}/version/${version.id}))`
        : "";
      bullets.push({
        weight: mod.weight,
        name: mod.name,
        text: group.fromText === null
          ? `- ${verb} ${mod.name} to ${group.toText}${scope}.${link}`
          : `- ${verb} ${mod.name} from ${group.fromText} to ${group.toText}${scope}.${link}`,
      });
    }
  }

  return bullets
    .map((bullet, index) => ({ ...bullet, index }))
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name) || a.index - b.index)
    .map((bullet) => bullet.text);
}

module.exports = {
  MRPACKS,
  USER_AGENT,
  collectChanges,
  versionIdsOf,
  fetchModrinthVersions,
  cleanVersion,
  buildUpdateBullets,
  mentioned,
};
