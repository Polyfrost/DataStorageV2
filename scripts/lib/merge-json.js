"use strict";

const fs = require("node:fs");

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Recursively merges `source` into `target`. Throws when both hold different
 * non-object values (arrays included) at the same path.
 */
function mergeJson(target, source, where = "$") {
  for (const [key, value] of Object.entries(source)) {
    const at = `${where}.${key}`;
    if (!Object.hasOwn(target, key)) {
      target[key] = value;
    } else if (isObject(target[key]) && isObject(value)) {
      mergeJson(target[key], value, at);
    } else if (JSON.stringify(target[key]) !== JSON.stringify(value)) {
      throw new Error(
        `conflicting values at ${at}: ${JSON.stringify(target[key])} vs ${JSON.stringify(value)}`
      );
    }
  }
  return target;
}

/** Parses and merges JSON object files in order, naming the files on conflict. */
function mergeJsonFiles(files) {
  const merged = {};
  files.forEach((file, i) => {
    try {
      mergeJson(merged, JSON.parse(fs.readFileSync(file, "utf-8")));
    } catch (err) {
      const previous = files.slice(0, i).join(", ") || "nothing";
      throw new Error(`cannot merge ${file} into ${previous}: ${err.message}`);
    }
  });
  return merged;
}

module.exports = { mergeJson, mergeJsonFiles };

// Usage: node merge-json.js <output> <input...>
if (require.main === module) {
  const [output, ...inputs] = process.argv.slice(2);
  try {
    fs.writeFileSync(
      output,
      JSON.stringify(mergeJsonFiles(inputs), null, 4) + "\n"
    );
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
