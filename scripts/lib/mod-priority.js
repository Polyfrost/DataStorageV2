"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PRIORITY_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "oneclient",
  "bundles",
  "mod-priority.json"
);

function readPriorities(warn = () => {}, file = PRIORITY_FILE) {
  if (!fs.existsSync(file)) return {};
  const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
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

function priorityFor(mod, priorities) {
  for (const key of [mod.slug, mod.projectId, mod.slugHint]) {
    if (!key) continue;
    const value = priorities[String(key).toLowerCase()];
    if (value !== undefined) return { value, matched: String(key).toLowerCase() };
  }
  return { value: 0, matched: null };
}

module.exports = { PRIORITY_FILE, readPriorities, priorityFor };
