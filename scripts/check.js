const fs = require("fs");
const path = require("path");

const toml = require("@iarna/toml");

const errors = [];
// Modrinth project ids of every bundled mod, for validating disable-warnings.json
const bundledProjectIds = new Set();

// packwiz source packs live under data/oneclient/bundles/.mrpacks/<version>/<Bundle>
const MRPACKS_DIR = path.join(
  __dirname,
  "..",
  "data",
  "oneclient",
  "bundles",
  ".mrpacks"
);

function checkMod(file) {
  const fileData = fs.readFileSync(file, "utf-8");
  const parsed = toml.parse(fileData);

  const projectId = parsed.update?.modrinth?.["mod-id"];
  if (projectId) bundledProjectIds.add(projectId);

  if (!parsed.id) {
    errors.push(`${file} doesn't have an id?`);
    return null;
  }

  if (!parsed.filename || !parsed.filename.endsWith(".jar")) {
    errors.push(`${file} invalid mod name`);
    return null;
  }

  if (!parsed.download?.url) {
    errors.push(`${file} doesn't have a download url?`);
    return null;
  }

  if (!parsed.update && !parsed.overrides) {
    errors.push(`${file} doesn't have overrides...`);
    return parsed.id;
  }

  if (parsed.update?.modrinth?.version) {
    const modVersion = parsed.update.modrinth.version;
    const split = parsed.download.url.split("/");
    const urlVersion = decodeURIComponent(split[split.length - 2]);
    const urlFilename = decodeURIComponent(split[split.length - 1]);
    // Modrinth CDN urls normally embed the version id, but some older versions
    // embed the version number instead. Accept either, as long as the url still
    // points at the declared jar.
    if (urlVersion !== modVersion && urlFilename !== parsed.filename) {
      errors.push(`${file} has a bad download modrinth url. Please fix`);
      return parsed.id;
    }
  }

  return parsed.id;
}

function checkBundle(bundlePath, bundle) {
  const mods = fs.readdirSync(`${bundlePath}/mods`);
  const modIds = [];
  for (const mod of mods) {
    if (!mod.endsWith(".toml")) {
      errors.push(
        `${bundlePath} - Will not work because it contains a jar file`
      );
      return;
    }

    const modPath = `${bundlePath}/mods/${mod}`;
    const modId = checkMod(modPath);
    if (!modId) continue;
    if (modId.toLowerCase() === bundle.toLowerCase()) {
      errors.push(
        `${modPath} uses the defualt mod id. This is not recommended but not blocked`
      );
    }
    if (modIds.includes(modId)) {
      errors.push(`${modPath} has a duplicate mod id`);
    } else {
      modIds.push(modId);
    }
  }
}

const versions = fs.readdirSync(MRPACKS_DIR);
for (const version of versions) {
  const bundles = fs.readdirSync(path.join(MRPACKS_DIR, version));
  for (const bundle of bundles) {
    checkBundle(path.join(MRPACKS_DIR, version, bundle), bundle);
  }
}

// Bundled-mod disable warnings, shipped as-is and read by the launcher
const DISABLE_WARNINGS_FILE = path.join(
  __dirname,
  "..",
  "data",
  "oneclient",
  "bundles",
  "disable-warnings.json"
);

function checkDisableWarning(label, warning) {
  if (!warning || typeof warning !== "object" || Array.isArray(warning)) {
    errors.push(`disable-warnings.json: ${label} must be an object`);
    return;
  }
  if (typeof warning.message !== "string" || !warning.message.endsWith(".md")) {
    errors.push(`disable-warnings.json: ${label} message must be a .md path`);
  } else {
    const file = path.join(__dirname, "..", "data", warning.message);
    if (!fs.existsSync(file) || !fs.readFileSync(file, "utf-8").trim()) {
      errors.push(
        `disable-warnings.json: ${label} message ${warning.message} is missing or empty`
      );
    }
  }
}

if (fs.existsSync(DISABLE_WARNINGS_FILE)) {
  const disableWarnings = JSON.parse(
    fs.readFileSync(DISABLE_WARNINGS_FILE, "utf-8")
  );
  for (const [key, warning] of Object.entries(disableWarnings.mods ?? {})) {
    checkDisableWarning(`mods.${key}`, warning);
    if (!bundledProjectIds.has(key)) {
      console.warn(
        `::warning::disable-warnings.json: "${key}" is not the Modrinth project id of any bundled mod`
      );
    }
  }
}

if (errors.length > 0) {
  errors.forEach((error) => console.log(error));
  throw new Error("Something wen't wrong");
}
