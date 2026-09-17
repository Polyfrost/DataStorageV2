const fs = require("fs");
const path = require("path");

const toml = require("@iarna/toml");

const REPO_ROOT = path.join(__dirname, "..");
const MRPACKS_DIR = path.join(
  REPO_ROOT,
  "data",
  "oneclient",
  "bundles",
  ".mrpacks"
);
const PRIORITY_FILE = path.join(
  REPO_ROOT,
  "data",
  "oneclient",
  "bundles",
  "mod-priority.json"
);
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "data", "oneclient", "mods.json");

const IGNORED_VERSIONS = ["26.1-fabric"];

const MODRINTH_API = "https://api.modrinth.com/v2";
const USER_AGENT =
  "Polyfrost/DataStorageV2 (data-v2.polyfrost.org) generate-mods-json";
const BATCH_SIZE = 100;
const FETCH_ATTEMPTS = 5;

const DIR_TYPES = {
  mods: "mod",
};

const warnings = [];
function warn(message) {
  warnings.push(message);
  console.warn(`::warning::${message}`);
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return a.localeCompare(b);
}

function parseVersionDir(dir) {
  const index = dir.lastIndexOf("-");
  if (index === -1) return { minecraft: dir, loader: null };
  return {
    minecraft: dir.slice(0, index),
    loader: dir.slice(index + 1).toLowerCase(),
  };
}

function readPriorities() {
  if (!fs.existsSync(PRIORITY_FILE)) return {};
  const parsed = JSON.parse(fs.readFileSync(PRIORITY_FILE, "utf-8"));
  const out = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith("$")) continue; // $schema / $comment style keys
    if (!Number.isInteger(value)) {
      warn(`mod-priority.json: "${key}" is not an integer, ignoring`);
      continue;
    }
    out[key.toLowerCase()] = value;
  }
  return out;
}

function readBundle(bundleDir) {
  const records = [];
  for (const [dirName, fallbackType] of Object.entries(DIR_TYPES)) {
    const dir = path.join(bundleDir, dirName);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith(".pw.toml")) continue;
      const file = path.join(dir, entry);
      const parsed = toml.parse(fs.readFileSync(file, "utf-8"));
      const projectId = parsed.update?.modrinth?.["mod-id"] ?? parsed.id;
      if (!projectId) {
        warn(`${file} has no Modrinth project id, skipping`);
        continue;
      }
      records.push({
        projectId,
        slugHint: entry.replace(/\.pw\.toml$/, ""),
        name: parsed.name ?? null,
        description: parsed.overrides?.description ?? null,
        authors: parsed.overrides?.authors ?? null,
        side: parsed.side ?? null,
        hidden: parsed.hidden === true,
        enabled: parsed.enabled !== false,
        fallbackType,
      });
    }
  }
  return records;
}

function bundleCategory(bundleDir) {
  const packFile = path.join(bundleDir, "pack.toml");
  if (fs.existsSync(packFile)) {
    const parsed = toml.parse(fs.readFileSync(packFile, "utf-8"));
    if (parsed.category) return String(parsed.category);
  }
  return path.basename(bundleDir);
}

function collect() {
  const mods = new Map(); // projectId -> aggregated entry
  const allVersions = new Set();
  const allCategories = new Set();
  const allLoaders = new Set();

  const versionDirs = fs
    .readdirSync(MRPACKS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(
      (name) =>
        !IGNORED_VERSIONS.some(
          (ignored) => ignored.toLowerCase() === name.toLowerCase()
        )
    );

  for (const versionDir of versionDirs) {
    const { minecraft, loader } = parseVersionDir(versionDir);
    allVersions.add(minecraft);
    if (loader) allLoaders.add(loader);

    const versionPath = path.join(MRPACKS_DIR, versionDir);
    for (const entry of fs.readdirSync(versionPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const bundleDir = path.join(versionPath, entry.name);
      const category = bundleCategory(bundleDir);
      allCategories.add(category);

      for (const record of readBundle(bundleDir)) {
        let mod = mods.get(record.projectId);
        if (!mod) {
          mod = {
            projectId: record.projectId,
            slugHint: record.slugHint,
            names: new Set(),
            descriptions: new Set(),
            authors: new Set(),
            sides: new Set(),
            categories: new Set(),
            minecraftVersions: new Set(),
            loaders: new Set(),
            fallbackType: record.fallbackType,
            hiddenEverywhere: true,
            enabledAnywhere: false,
          };
          mods.set(record.projectId, mod);
        }
        if (record.name) mod.names.add(record.name);
        if (record.description) mod.descriptions.add(record.description);
        for (const author of record.authors ?? []) mod.authors.add(author);
        if (record.side) mod.sides.add(record.side);
        mod.categories.add(category);
        mod.minecraftVersions.add(minecraft);
        if (loader) mod.loaders.add(loader);
        if (!record.hidden) mod.hiddenEverywhere = false;
        if (record.enabled) mod.enabledAnywhere = true;
      }
    }
  }

  return {
    mods: [...mods.values()],
    versions: [...allVersions].sort(compareVersions),
    categories: [...allCategories].sort((a, b) => a.localeCompare(b)),
    loaders: [...allLoaders].sort(),
  };
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (response.ok) return await response.json();
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < FETCH_ATTEMPTS) {
      const wait = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
      console.log(
        `Modrinth request failed (${lastError.message}); retry ${attempt}/${FETCH_ATTEMPTS} in ${wait / 1000}s`
      );
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastError;
}

async function fetchProjects(ids) {
  const byId = new Map();
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const url = `${MODRINTH_API}/projects?ids=${encodeURIComponent(JSON.stringify(batch))}`;
    let projects;
    try {
      projects = await fetchWithRetry(url);
    } catch (error) {
      throw new Error(
        `Could not fetch Modrinth metadata for ${batch.length} project(s): ${error.message}`
      );
    }
    for (const project of projects) byId.set(project.id, project);
  }
  return byId;
}

function priorityFor(mod, priorities) {
  for (const key of [mod.slug, mod.projectId, mod.slugHint]) {
    if (!key) continue;
    const value = priorities[String(key).toLowerCase()];
    if (value !== undefined) return { value, matched: String(key).toLowerCase() };
  }
  return { value: 0, matched: null };
}

async function main() {
  const outputFile = process.argv[2]
    ? path.resolve(process.argv[2])
    : DEFAULT_OUTPUT;

  const { mods: allMods, versions, categories, loaders } = collect();
  console.log(
    `Found ${allMods.length} unique projects across ${versions.length} Minecraft version(s)`
  );

  const mods = allMods.filter((mod) => !mod.hiddenEverywhere);
  const hiddenCount = allMods.length - mods.length;
  if (hiddenCount) console.log(`Skipping ${hiddenCount} hidden mod(s)`);

  const projects = await fetchProjects(mods.map((mod) => mod.projectId));
  const priorities = readPriorities();

  const allEntries = mods.map((mod) => {
    const project = projects.get(mod.projectId);
    const slug = project?.slug ?? mod.slugHint;
    const type = project?.project_type ?? mod.fallbackType;
    const { value: priority, matched } = priorityFor(
      { ...mod, slug },
      priorities
    );

    const modCategories = [...mod.categories].sort((a, b) =>
      a.localeCompare(b)
    );

    return {
      id: mod.projectId,
      slug,
      name: [...mod.names][0] ?? project?.title ?? slug,
      description:
        [...mod.descriptions][0] ?? project?.description ?? null,
      authors: [...mod.authors].sort((a, b) => a.localeCompare(b)),
      icon: project?.icon_url ?? null,
      link: `https://modrinth.com/${type}/${slug}`,
      type,
      category: modCategories[0] ?? null,
      categories: modCategories,
      side:
        mod.sides.size === 1 ? [...mod.sides][0] : mod.sides.size ? "both" : null,
      minecraftVersions: [...mod.minecraftVersions].sort(compareVersions),
      loaders: [...mod.loaders].sort(),
      priority,
      enabledByDefault: mod.enabledAnywhere,
      // Only used for the stale-key warning below; stripped from the output.
      _priorityKey: matched,
    };
  });

  const kept = allEntries.filter((entry) => {
    if (entry.icon) return true;
    console.log(`Skipping ${entry.slug}: no Modrinth icon`);
    return false;
  });
  const entries = kept.map(({ _priorityKey, ...entry }) => entry);

  const usedPriorityKeys = new Set(
    kept.map((entry) => entry._priorityKey).filter(Boolean)
  );
  for (const key of Object.keys(priorities)) {
    if (!usedPriorityKeys.has(key)) {
      warn(`mod-priority.json: "${key}" matched no mod in the feed`);
    }
  }

  entries.sort(
    (a, b) => b.priority - a.priority || a.name.localeCompare(b.name)
  );

  const output = {
    minecraftVersions: versions,
    loaders,
    categories,
    mods: entries,
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 4) + "\n");
  console.log(
    `Wrote ${entries.length} mods to ${outputFile}${warnings.length ? ` (${warnings.length} warning(s))` : ""}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
