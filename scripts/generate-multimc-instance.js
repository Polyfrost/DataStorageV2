#!/usr/bin/env node
// Builds a MultiMC/Prism instance zip for the 1.8.9 Ornithe bundles.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const toml = require("@iarna/toml");
const { zipSync } = require("fflate");

const VERSION_DIR = path.join(__dirname, "../data/oneclient/bundles/.mrpacks/1.8.9-ornithe");
const OUTPUT = path.resolve(process.argv[2] || path.join(__dirname, ".cache/oneclient-1.8.9-ornithe-multimc.zip"));
const META = "https://meta.ornithemc.net";
const MAVEN = "https://maven.ornithemc.net/releases";
const MANIFEST = "https://ornithemc.net/mc-versions/version_manifest.json";

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res;
}
const getJson = async (url) => (await get(url)).json();
const json = (value) => Buffer.from(JSON.stringify(value, null, 4));

function collectMods(categories) {
  const mods = new Map();
  for (const category of categories) {
    for (const rel of fs.readdirSync(category, { recursive: true })) {
      if (!rel.endsWith(".pw.toml")) continue;
      const mod = toml.parse(fs.readFileSync(path.join(category, rel), "utf8"));
      if (mod.enabled === false) continue;
      const dest = path.posix.join(".minecraft", path.dirname(rel).split(path.sep).join("/"), mod.filename);
      if (!mods.has(dest)) mods.set(dest, mod.download);
    }
  }
  return mods;
}

async function download(dest, { url, hash, "hash-format": format }) {
  const data = Buffer.from(await (await get(url)).arrayBuffer());
  const actual = crypto.createHash(format).update(data).digest("hex");
  if (actual !== hash) throw new Error(`${format} mismatch for ${dest}: expected ${hash}, got ${actual}`);
  return data;
}

async function main() {
  const categories = fs
    .readdirSync(VERSION_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(VERSION_DIR, entry.name));
  const pack = toml.parse(fs.readFileSync(path.join(categories[0], "pack.toml"), "utf8"));
  const mc = pack.versions.minecraft;
  const loader = pack.versions.fabric;
  const javaMajors = pack["java-version-override"] ? [pack["java-version-override"]] : [25, 21, 17, 8];

  const [manifest, [intermediary], profile, extraLibs] = await Promise.all([
    getJson(MANIFEST),
    getJson(`${META}/v3/versions/intermediary/${mc}`),
    getJson(`${META}/v3/versions/fabric-loader/${mc}/${loader}/profile/json`),
    getJson(`${META}/v3/versions/libraries/${mc}`),
  ]);
  const entry = manifest.versions.find((version) => version.id === mc);
  if (!entry) throw new Error(`Minecraft ${mc} is not in the Ornithe version manifest`);
  if (!intermediary) throw new Error(`no Calamus intermediary for Minecraft ${mc}`);
  const vanilla = await getJson(entry.url);

  const lwjgl = vanilla.libraries.find((lib) => lib.name.split(":")[1] === "lwjgl");
  const lwjglVersion = lwjgl.name.split(":")[2];
  const lwjglUid = lwjglVersion.startsWith("3") ? "org.lwjgl3" : "org.lwjgl";
  const lwjglName = `LWJGL ${lwjglVersion[0]}`;

  const traits = [];
  if (vanilla.mainClass.includes("launchwrapper")) traits.push("texturepacks");
  let minecraftArguments = vanilla.minecraftArguments || "";
  const gameArgs = (vanilla.arguments?.game || []).filter((arg) => typeof arg === "string");
  if (gameArgs.length) {
    minecraftArguments = gameArgs.join(" ");
    traits.push("FirstThreadOnMacOS");
  }

  const files = {};
  const components = [
    {
      cachedName: lwjglName,
      cachedVersion: lwjglVersion,
      cachedVolatile: true,
      dependencyOnly: true,
      uid: lwjglUid,
      version: lwjglVersion,
    },
    {
      cachedName: "Minecraft",
      cachedRequires: [{ suggests: lwjglVersion, uid: lwjglUid }],
      cachedVersion: mc,
      important: true,
      uid: "net.minecraft",
      version: mc,
    },
    {
      cachedName: "Intermediary Mappings",
      cachedRequires: [{ equals: mc, uid: "net.minecraft" }],
      cachedVersion: intermediary.version,
      dependencyOnly: true,
      uid: "net.fabricmc.intermediary",
      version: mc,
    },
    {
      cachedName: "Fabric Loader",
      cachedRequires: [{ uid: "net.fabricmc.intermediary" }],
      cachedVersion: loader,
      uid: "net.fabricmc.fabric-loader",
      version: loader,
    },
  ];

  files["instance.cfg"] = Buffer.from(
    [
      "InstanceType=OneSix",
      "MCLaunchMethod=LauncherPart",
      `name=OneClient ${mc} Ornithe`,
      "OverrideModDownloadLoaders=true",
      'ModDownloadLoaders=[\\"ornithe\\", \\"legacy-fabric\\", \\"babric\\"]',
      "OverrideEnv=true",
      'Env={\\"__GL_THREADED_OPTIMIZATIONS\\":\\"0\\"}',
      // MultiMC ignores the +jvmArgs patch
      "OverrideJavaArgs=true",
      "JvmArgs=-Dfabric.fixPackageAccess=true",
      "",
    ].join("\n"),
  );

  files["patches/net.minecraft.json"] = json({
    assetIndex: vanilla.assetIndex,
    compatibleJavaMajors: javaMajors,
    compatibleJavaName: "java-runtime-epsilon",
    formatVersion: 1,
    libraries: vanilla.libraries.filter((lib) => !lib.name.includes("org.ow2.asm")),
    mainClass: vanilla.mainClass,
    mainJar: {
      downloads: { artifact: vanilla.downloads.client },
      name: `com.mojang:minecraft:${mc}:client`,
    },
    minecraftArguments,
    name: "Minecraft",
    releaseTime: vanilla.releaseTime,
    requires: [{ suggests: lwjglVersion, uid: lwjglUid }],
    type: vanilla.type,
    uid: "net.minecraft",
    version: mc,
    ...(traits.length && { "+traits": traits }),
    ...(profile.arguments?.jvm && { "+jvmArgs": profile.arguments.jvm }),
  });

  files["patches/net.fabricmc.intermediary.json"] = json({
    formatVersion: 1,
    libraries: [{ name: intermediary.maven, url: MAVEN }],
    name: "Intermediary Mappings",
    requires: [{ equals: mc, uid: "net.minecraft" }],
    type: "release",
    uid: "net.fabricmc.intermediary",
    version: intermediary.version,
  });

  for (const lib of extraLibs) {
    const split = lib.name.lastIndexOf(":");
    const uid = lib.name.slice(0, split).replaceAll(":", ".");
    const name = lib.name.slice(lib.name.indexOf(":") + 1, split);
    const version = lib.name.slice(split + 1);
    files[`patches/${uid}.json`] = json({
      formatVersion: 1,
      libraries: [lib],
      name,
      type: "release",
      uid,
      version,
    });
    components.push({ cachedName: name, cachedVersion: version, uid });
  }

  if (!(lwjgl.downloads?.artifact?.url || "").startsWith("https://libraries.minecraft.net")) {
    files[`patches/${lwjglUid}.json`] = json({
      formatVersion: 1,
      name: lwjglName,
      type: "release",
      uid: lwjglUid,
      version: lwjglVersion,
    });
  }

  files["mmc-pack.json"] = json({ components, formatVersion: 1 });

  const mods = [...collectMods(categories)];
  console.log(`Downloading ${mods.length} files`);
  for (let i = 0; i < mods.length; i += 8) {
    await Promise.all(
      mods.slice(i, i + 8).map(async ([dest, source]) => {
        files[dest] = await download(dest, source);
      }),
    );
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, zipSync(files, { level: 0 }));
  console.log(`Wrote ${OUTPUT} (Minecraft ${mc}, Fabric Loader ${loader}, Java ${javaMajors.join("/")})`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
