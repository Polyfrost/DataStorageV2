// Node counterpart of setup-packwiz.sh for local tooling: finds a packwiz
// binary, downloading the prebuilt one for this OS from nightly.link if needed.
//
// Resolution order:
//   1. $PACKWIZ_BIN
//   2. `packwiz` on PATH
//   3. A previously downloaded copy cached next to the scripts (shared with
//      setup-packwiz.sh)
//   4. Download the Polyfrost/packwiz workflow artifact via nightly.link
const fs = require("node:fs");
const path = require("node:path");
const { unzipSync } = require("fflate");

const EXE = process.platform === "win32" ? "packwiz.exe" : "packwiz";
const CACHED_BIN = path.join(__dirname, "..", EXE);
const NIGHTLY_BASE = "https://nightly.link/Polyfrost/packwiz/workflows/go/main";

// Artifact names from Polyfrost/packwiz .github/workflows/go.yml.
const ARTIFACTS = {
  "win32-x64": "Windows 64-bit",
  "win32-arm64": "Windows 64-bit ARM",
  "linux-x64": "Linux 64-bit x86",
  "linux-arm64": "Linux 64-bit ARM",
  "darwin-x64": "macOS 64-bit x86",
  "darwin-arm64": "macOS 64-bit ARM",
};

function findOnPath() {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, EXE);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function download() {
  const artifact = ARTIFACTS[`${process.platform}-${process.arch}`];
  if (!artifact) {
    throw new Error(
      `No prebuilt packwiz for ${process.platform}-${process.arch}; install packwiz and put it on PATH.`
    );
  }
  const url = `${NIGHTLY_BASE}/${encodeURIComponent(artifact)}.zip`;
  console.log(`packwiz not found, downloading ${artifact} (${url})`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Could not fetch packwiz (${response.status} ${response.statusText}); ` +
        "the nightly.link download only works while the latest artifact is live."
    );
  }
  const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const binary = entries[EXE];
  if (!binary) throw new Error(`${EXE} missing from ${url}`);

  fs.writeFileSync(CACHED_BIN, binary, { mode: 0o755 });
  return CACHED_BIN;
}

async function ensurePackwiz() {
  if (process.env.PACKWIZ_BIN) return process.env.PACKWIZ_BIN;

  const onPath = findOnPath();
  if (onPath) {
    console.log(`Using packwiz from PATH: ${onPath}`);
    return onPath;
  }
  if (fs.existsSync(CACHED_BIN)) {
    console.log(`Using cached packwiz: ${CACHED_BIN}`);
    return CACHED_BIN;
  }
  return download();
}

module.exports = { ensurePackwiz };
