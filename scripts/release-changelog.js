const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const {
  CHANGELOG_PATH,
  parse,
  serialize,
  validate,
  unreleasedBullets,
  previousReleaseSha,
  release,
} = require("./lib/modpack-changelog.js");
const { readPriorities, priorityFor } = require("./lib/mod-priority.js");
const {
  collectChanges,
  versionIdsOf,
  fetchModrinthVersions,
  buildUpdateBullets,
} = require("./lib/mod-updates.js");

const ROOT = path.join(__dirname, "..");
const FILE = process.env.MODPACK_CHANGELOG_PATH
  ? path.resolve(process.env.MODPACK_CHANGELOG_PATH)
  : CHANGELOG_PATH;

function git(args, input) {
  return execFileSync("git", args, {
    cwd: ROOT,
    input,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
  });
}

function isReachable(sha) {
  try {
    git(["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

async function updateBullets(from, to, exclude) {
  const changes = collectChanges(git, from, to);
  let versions = new Map();
  try {
    versions = await fetchModrinthVersions(versionIdsOf(changes));
  } catch (error) {
    console.warn(`::warning::Could not read mod versions from Modrinth (${error.message}); listing updates by file name without changelog links.`);
  }
  const priorities = readPriorities((message) => console.warn(`::warning::${message}`));
  return buildUpdateBullets(changes, versions, { priorities, priorityFor, exclude });
}

async function main() {
  const version = process.argv[2];
  if (!version || !/^v?\d+\.\d+\.\d+$/.test(version)) {
    console.error("Usage: node scripts/release-changelog.js <v2.0.N>");
    process.exit(1);
  }

  const text = fs.readFileSync(FILE, "utf8");
  const doc = parse(text);

  const bullets = unreleasedBullets(doc);
  if (bullets.length === 0) {
    console.log(`Nothing under ## [Unreleased]; ${version} folds into the next release.`);
    return;
  }

  const head = git(["rev-parse", "HEAD"]).toString("utf8").trim();
  const previous = previousReleaseSha(doc);

  let extra = [];
  if (previous && isReachable(previous)) {
    try {
      extra = await updateBullets(previous, head, bullets);
    } catch (error) {
      console.warn(`::warning::Could not list the automatic mod updates (${error.message}); skipping them.`);
    }
  } else if (previous) {
    console.warn(`::warning::Commit ${previous} of the previous release is not available; skipping the automatic mod update lines.`);
  }

  const date = new Date().toISOString().slice(0, 10);
  release(doc, version, date, head, extra);

  const output = serialize(doc);
  const after = validate(parse(output));
  if (after.length) {
    for (const error of after) console.error(`line ${error.line}: ${error.message}`);
    console.error("Releasing would produce an invalid changelog; not writing it.");
    process.exit(1);
  }

  fs.writeFileSync(FILE, output);
  console.log(`Released ${version.replace(/^v/, "")} (${date}) at ${head}.`);
  for (const line of extra) console.log(line);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
