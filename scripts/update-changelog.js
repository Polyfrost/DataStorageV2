const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const DEFAULT_CHANGELOG = path.join(
  REPO_ROOT,
  "data",
  "oneclient",
  "CHANGE_LOG.md"
);

const SOURCE_REPO = "Polyfrost/OneLauncher";
const TAG_PREFIX = "oneclient-";
const GITHUB_API = "https://api.github.com";
const USER_AGENT =
  "Polyfrost/DataStorageV2 (data-v2.polyfrost.org) update-changelog";
const FETCH_ATTEMPTS = 5;
const PER_PAGE = 100;

const warnings = [];
function warn(message) {
  warnings.push(message);
  console.warn(`::warning::${message}`);
}

const ALWAYS_DROP = [
  /^merge (pull request|branch|remote)/i,
  /^(chore(\([^)]*\))?:\s*)?bump(ed)?( the)?( workspace)?( version)?( to)? v?\d+\.\d+\.\d+/i,
  /^v?\d+\.\d+\.\d+$/,
  /^release v?\d+\.\d+\.\d+/i,
];

const NOISE_DROP = [
  /^chore\(ci\)/i,
  /workflow/i,
  /\breadme\b/i,
  /^\[?dependabot/i,
  /^chore: update \.github/i,
];

const PR_SUFFIX = /\s*\(#\d+\)\s*$/;
const PART_SUFFIX = /\s*\b(?:pt\.?|part)\s*\d+\s*$/i;

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

async function fetchWithRetry(url) {
  const headers = { "User-Agent": USER_AGENT, Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  let lastError;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { headers });
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
        `GitHub request failed (${lastError.message}); retry ${attempt}/${FETCH_ATTEMPTS} in ${wait / 1000}s`
      );
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastError;
}

function readChangelogVersions(contents) {
  const versions = [];
  for (const line of contents.split("\n")) {
    const match = /^#\s+v?(\d+\.\d+\.\d+)\s*$/.exec(line);
    if (match) versions.push(match[1]);
  }
  return versions;
}

async function fetchReleases() {
  const releases = [];
  for (let page = 1; ; page++) {
    const batch = await fetchWithRetry(
      `${GITHUB_API}/repos/${SOURCE_REPO}/releases?per_page=${PER_PAGE}&page=${page}`
    );
    releases.push(...batch);
    if (batch.length < PER_PAGE) break;
  }

  return releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => ({
      tag: release.tag_name,
      version: release.tag_name.startsWith(TAG_PREFIX)
        ? release.tag_name.slice(TAG_PREFIX.length)
        : null,
    }))
    .filter((release) => release.version && /^\d+\.\d+\.\d+$/.test(release.version))
    .sort((a, b) => compareVersions(a.version, b.version));
}

function isBot(commit) {
  const login = commit.author?.login ?? "";
  const name = commit.commit?.author?.name ?? "";
  return login.endsWith("[bot]") || name.endsWith("[bot]");
}

function dedupeKey(subject) {
  return subject
    .replace(PART_SUFFIX, "")
    .toLowerCase()
    .replace(/[.\s]+$/, "")
    .replace(/\s+/g, " ");
}

function buildEntries(commits, { lenient = false } = {}) {
  const subjects = [...commits]
    .reverse()
    .filter((commit) => !isBot(commit))
    .map((commit) => commit.commit.message.split("\n")[0].trim())
    .filter((subject) => subject.length > 0)
    .filter((subject) => !ALWAYS_DROP.some((pattern) => pattern.test(subject)))
    .filter(
      (subject) => lenient || !NOISE_DROP.some((pattern) => pattern.test(subject))
    )
    .map((subject) => subject.replace(PR_SUFFIX, ""));

  const groups = new Map();
  for (const [index, subject] of subjects.entries()) {
    const key = dedupeKey(subject);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { index, subject });
      continue;
    }
    if (PART_SUFFIX.test(existing.subject) && !PART_SUFFIX.test(subject)) {
      existing.subject = subject;
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.index - b.index)
    .map((group) => group.subject);
}

async function buildSection(previous, release) {
  const url = `${GITHUB_API}/repos/${SOURCE_REPO}/compare/${previous.tag}...${release.tag}`;
  const comparison = await fetchWithRetry(url);
  const commits = comparison.commits ?? [];

  let entries = buildEntries(commits);
  if (entries.length === 0 && commits.length > 0) {
    entries = buildEntries(commits, { lenient: true });
    if (entries.length > 0) {
      warn(
        `${release.version}: every commit looked like noise, keeping the unfiltered list for review`
      );
    }
  }

  if (entries.length === 0) {
    warn(`${release.version}: no changelog-worthy commits since ${previous.tag}, skipping`);
    return null;
  }

  console.log(
    `${release.version}: ${entries.length} entr${entries.length === 1 ? "y" : "ies"} from ${commits.length} commit(s) since ${previous.tag}`
  );
  return `# ${release.version}\n\n${entries.map((entry) => `- ${entry}`).join("\n")}\n`;
}

function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  fs.appendFileSync(file, `${name}=${value}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const target = args.find((arg) => !arg.startsWith("--"));
  const changelogFile = target ? path.resolve(target) : DEFAULT_CHANGELOG;

  const contents = fs.readFileSync(changelogFile, "utf-8");
  const known = readChangelogVersions(contents);
  if (known.length === 0) {
    throw new Error(`No "# X.Y.Z" headings found in ${changelogFile}`);
  }
  const newest = known.sort(compareVersions)[known.length - 1];
  console.log(`Newest version in the changelog: ${newest}`);

  const releases = await fetchReleases();
  const missing = releases.filter(
    (release) => compareVersions(release.version, newest) > 0
  );

  if (missing.length === 0) {
    console.log("Changelog is up to date with the latest OneClient release");
    setOutput("changed", "false");
    return;
  }

  console.log(
    `Missing ${missing.length} version(s): ${missing.map((r) => r.version).join(", ")}`
  );

  const sections = [];
  for (const release of missing) {
    const index = releases.indexOf(release);
    const previous = releases[index - 1];
    if (!previous) {
      warn(`${release.version}: no preceding release tag to compare against, skipping`);
      continue;
    }
    const section = await buildSection(previous, release);
    if (section) sections.push({ version: release.version, section });
  }

  if (sections.length === 0) {
    console.log("Nothing to add after filtering");
    setOutput("changed", "false");
    return;
  }

  const ordered = [...sections].reverse();
  const block = ordered.map(({ section }) => section).join("\n");
  const updated = `${block}\n${contents.replace(/^\n+/, "")}`;

  const added = ordered.map(({ version }) => version);
  if (dryRun) {
    console.log(`\n--- would prepend to ${changelogFile} ---\n${block}`);
  } else {
    fs.writeFileSync(changelogFile, updated);
    console.log(`Added ${added.join(", ")} to ${changelogFile}`);
  }

  setOutput("changed", "true");
  setOutput("versions", added.join(", "));
  setOutput("latest", added[0]);

  if (warnings.length) console.log(`${warnings.length} warning(s)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
