"use strict";

const fs = require("fs");
const path = require("path");
const { validateFeaturedServers } = require("./lib/featured-servers");

const catalogPath = path.join(__dirname, "..", "data", "oneclient", "servers.json");
let catalog;
try {
  catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
} catch (error) {
  console.error(`${catalogPath}: invalid JSON: ${error.message}`);
  process.exitCode = 1;
  return;
}

const errors = validateFeaturedServers(catalog);
if (errors.length > 0) {
  errors.forEach((error) => console.error(`${catalogPath}: ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Featured server catalog valid (${catalog.servers.length} servers)`);
}
