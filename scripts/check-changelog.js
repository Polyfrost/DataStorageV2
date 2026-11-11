const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const {
  CHANGELOG_PATH,
  parse,
  validate,
  unreleasedBullets,
} = require("./lib/modpack-changelog.js");

const ROOT = path.join(__dirname, "..");
const FILE = process.env.MODPACK_CHANGELOG_PATH
  ? path.resolve(process.env.MODPACK_CHANGELOG_PATH)
  : CHANGELOG_PATH;
const REPO_FILE = path.relative(ROOT, CHANGELOG_PATH).split(path.sep).join("/");
const ANNOTATION_FILE = path.relative(ROOT, FILE).split(path.sep).join("/");
const MRPACKS = "data/oneclient/bundles/.mrpacks";

const FIX_HINT = `Add a line under ## [Unreleased] in ${REPO_FILE} describing the change for players, or add the no-changelog label.`;

function git(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function annotate(level, message, line) {
  const where = line ? `file=${ANNOTATION_FILE},line=${line}` : `file=${ANNOTATION_FILE}`;
  console.log(`::${level} ${where}::${message}`);
}

function baseUnreleasedBullets(base) {
  try {
    return new Set(unreleasedBullets(parse(git(["show", `${base}:${REPO_FILE}`]))));
  } catch {
    return new Set();
  }
}

function enforce(doc, base) {
  let changed;
  try {
    changed = git(["diff", "--name-only", `${base}...HEAD`, "--", MRPACKS])
      .split("\n")
      .filter(Boolean);
  } catch (err) {
    annotate("warning", `Could not diff against ${base}; skipping the changelog entry check. ${String(err.stderr || err.message).trim()}`);
    return true;
  }

  if (changed.length === 0) {
    console.log("No bundle changes; no changelog entry needed.");
    return true;
  }

  const before = baseUnreleasedBullets(base);
  const added = unreleasedBullets(doc).filter((bullet) => !before.has(bullet));
  if (added.length > 0) {
    console.log(`Bundle changes have ${added.length} new changelog entr${added.length === 1 ? "y" : "ies"}.`);
    return true;
  }

  annotate("error", `This change touches ${changed.length} bundle file(s) but adds no changelog entry. ${FIX_HINT}`);
  return false;
}

function main() {
  const doc = parse(fs.readFileSync(FILE, "utf8"));
  const errors = validate(doc);
  for (const error of errors) annotate("error", error.message, error.line);

  let ok = errors.length === 0;
  if (ok) console.log(`${ANNOTATION_FILE} is valid.`);

  const base = process.env.CHANGELOG_BASE;
  if (base && process.env.CHANGELOG_SKIP === "1") {
    console.log("Changelog entry check skipped.");
  } else if (base) {
    ok = enforce(doc, base) && ok;
  }

  if (!ok) process.exit(1);
}

main();
