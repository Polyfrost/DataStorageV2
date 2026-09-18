// Builds the site locally and serves it. Plain Node (plus packwiz) so it runs
// the same on Windows, macOS and Linux, without bash, rsync or zip.
//
// Mirrors CI: check.js -> generate-bundles.sh -> generate-mods-json.js ->
// build-site.sh -> serve.js. Unlike generate-bundles.sh it skips the
// deterministic rezip; the dev site's sha1s are computed from whatever is built.
//
// Usage: node scripts/dev-server.js [PORT]   (default 8080)
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { ensurePackwiz } = require("./lib/packwiz");
const { createServer } = require("./serve");

const REPO_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const BUNDLES_DIR = path.join(DATA_DIR, "oneclient", "bundles");
const MRPACKS_DIR = path.join(BUNDLES_DIR, ".mrpacks");
const GENERATED_DIR = path.join(BUNDLES_DIR, "generated");
const SITE_DIR = path.join(REPO_ROOT, "_site");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} ${args.join(" ")} exited with ${result.status}`);
  }
}

function runNode(script, args = []) {
  run(process.execPath, [path.join(__dirname, script), ...args]);
}

function subdirs(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

async function generateBundles() {
  const packwiz = await ensurePackwiz();
  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  // Export from a scratch copy: packwiz rewrites index.toml/pack.toml as it goes.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "datastorage-dev-"));
  try {
    fs.cpSync(MRPACKS_DIR, work, { recursive: true });
    for (const version of subdirs(work)) {
      for (const bundle of subdirs(path.join(work, version))) {
        const output = path.join(
          GENERATED_DIR,
          `${bundle.toLowerCase()}-${version}.mrpack`
        );
        console.log(`Bundling ${version}/${bundle} -> ${output}`);
        run(packwiz, ["modrinth", "export", "--output", output], {
          cwd: path.join(work, version, bundle),
        });
      }
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// Copy data/ into _site/, dropping every dotfile/dotfolder at any depth.
function buildSite() {
  fs.rmSync(SITE_DIR, { recursive: true, force: true });
  fs.cpSync(DATA_DIR, SITE_DIR, {
    recursive: true,
    filter: (src) => src === DATA_DIR || !path.basename(src).startsWith("."),
  });
  runNode("template.js", [SITE_DIR]);
  console.log(`Site built at ${SITE_DIR}`);
}

async function main() {
  const port = Number(process.argv[2] ?? 8080);

  runNode("check.js");
  await generateBundles();
  runNode("generate-mods-json.js");
  buildSite();

  console.log();
  createServer(SITE_DIR).listen(port, "127.0.0.1", () => {
    console.log(
      `Serving ${SITE_DIR} on http://localhost:${port} (ctrl-c to stop)`
    );
  });
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
