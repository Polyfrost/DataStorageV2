const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { unzipSync, zipSync } = require("fflate");

const API = "https://api.modrinth.com/v2";
const USER_AGENT =
  "Polyfrost/DataStorageV2 (github.com/Polyfrost/DataStorageV2) modrinth-publisher";

const GENERATED_DIR =
  process.argv[2] ||
  path.join(
    __dirname,
    "..",
    "data",
    "oneclient",
    "bundles",
    "generated"
  );

const TOKEN = process.env.MODRINTH_TOKEN;
const LOADER = "fabric";

const VERSION_PREFIX = "v2.0.";
const PATCH_RE = new RegExp(
  `^${VERSION_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`
);
const COMMIT = process.env.GITHUB_SHA;

const INDEX_NAME = "modrinth.index.json";

const CONTENT_MARKER = (digest) => `Content SHA-1: \`${digest}\``;
const CONTENT_MARKER_RE = /Content SHA-1: `([0-9a-f]{40})`/g;

const IGNORED_MC = new Set(["26.1"]);

const PROJECTS = [
  {
    prefix: "oneclient-skyblock-",
    projectId: process.env.MODRINTH_SKYBLOCK_PROJECT_ID,
    displayName: "OneClient (SkyBlock)",
  },
  {
    prefix: "oneclient-",
    projectId: process.env.MODRINTH_MODPACK_PROJECT_ID,
    displayName: "OneClient",
  },
];

function sha1(buffer) {
  return crypto.createHash("sha1").update(buffer).digest("hex");
}

function withVersionId(buffer, versionId) {
  const entries = unzipSync(new Uint8Array(buffer));
  if (!entries[INDEX_NAME]) {
    throw new Error(`${INDEX_NAME} not found in mrpack`);
  }
  const index = JSON.parse(Buffer.from(entries[INDEX_NAME]).toString("utf8"));
  index.versionId = versionId;
  entries[INDEX_NAME] = new Uint8Array(
    Buffer.from(JSON.stringify(index, null, 2))
  );
  return Buffer.from(zipSync(entries));
}

async function api(pathname, options = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...options,
    headers: {
      Authorization: TOKEN,
      "User-Agent": USER_AGENT,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Modrinth API ${options.method || "GET"} ${pathname} -> ${res.status} ${res.statusText}\n${body}`
    );
  }
  return res;
}

async function projectState(projectId) {
  const res = await api(`/project/${projectId}/version`);
  const versions = await res.json();
  const contentHashes = new Set();
  let maxPatch = -1;
  for (const version of versions) {
    for (const match of (version.changelog || "").matchAll(CONTENT_MARKER_RE)) {
      contentHashes.add(match[1]);
    }
    const match = version.version_number?.match(PATCH_RE);
    if (match) maxPatch = Math.max(maxPatch, Number(match[1]));
  }
  return { contentHashes, nextPatch: maxPatch + 1 };
}

async function createVersion({
  projectId,
  displayName,
  mc,
  file,
  versionNumber,
  contentSha1,
}) {
  const metadata = {
    name: `${displayName} ${versionNumber} (${mc})`,
    version_number: versionNumber,
    changelog: `Automated build for Minecraft ${mc}.${
      COMMIT ? ` (${COMMIT.slice(0, 7)})` : ""
    }\n\n${CONTENT_MARKER(contentSha1)}`,
    dependencies: [],
    game_versions: [mc],
    version_type: "release",
    loaders: [LOADER],
    featured: false,
    project_id: projectId,
    file_parts: ["file"],
    primary_file: "file",
  };

  const form = new FormData();
  form.append("data", JSON.stringify(metadata));
  form.append(
    "file",
    new Blob([file.buffer], { type: "application/x-modrinth-modpack+zip" }),
    file.name
  );

  await api("/version", { method: "POST", body: form });
  console.log(`  published ${displayName} ${mc} (${versionNumber})`);
}

function classify(filename) {
  if (!filename.endsWith(".mrpack")) return null;
  for (const project of PROJECTS) {
    if (filename.startsWith(project.prefix)) {
      const rest = filename.slice(
        project.prefix.length,
        -".mrpack".length
      );
      const mc = rest.replace(new RegExp(`-${LOADER}$`), "");
      return { project, mc };
    }
  }
  return null;
}

async function main() {
  if (!TOKEN) {
    console.log("MODRINTH_TOKEN not set; skipping Modrinth publish.");
    return;
  }
  if (!fs.existsSync(GENERATED_DIR)) {
    console.log(`No generated dir at ${GENERATED_DIR}; nothing to publish.`);
    return;
  }

  const files = fs
    .readdirSync(GENERATED_DIR)
    .filter((f) => f.endsWith(".mrpack"))
    .sort();

  const byProject = new Map();
  for (const filename of files) {
    const classified = classify(filename);
    if (!classified) continue;
    const { project, mc } = classified;
    if (IGNORED_MC.has(mc)) continue; // explicitly excluded version
    if (!project.projectId) continue; // project not configured
    if (!byProject.has(project)) byProject.set(project, []);
    byProject.get(project).push({ filename, mc });
  }

  if (byProject.size === 0) {
    console.log(
      "No configured projects matched the generated packs; nothing to publish."
    );
    return;
  }

  for (const [project, entries] of byProject) {
    console.log(`Project ${project.displayName} (${project.projectId}):`);
    const { contentHashes, nextPatch } = await projectState(project.projectId);
    let patch = nextPatch;

    for (const { filename, mc } of entries) {
      const buffer = fs.readFileSync(path.join(GENERATED_DIR, filename));
      const contentSha1 = sha1(buffer);
      if (contentHashes.has(contentSha1)) {
        console.log(`  up to date: ${mc} (${filename})`);
        continue;
      }
      const versionNumber = `${VERSION_PREFIX}${patch++}`;
      await createVersion({
        projectId: project.projectId,
        displayName: project.displayName,
        mc,
        file: { buffer: withVersionId(buffer, versionNumber), name: filename },
        versionNumber,
        contentSha1,
      });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
