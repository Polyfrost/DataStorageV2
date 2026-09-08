"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateFeaturedServers } = require("./featured-servers");

function server(overrides = {}) {
  return {
    id: "example-network",
    name: "Example Network",
    address: "play.example.net",
    outline_color: "#7C3AED",
    ...overrides,
  };
}

function featured(overrides = {}) {
  return {
    campaign_id: "example-fall-2026",
    starts_at: "2026-09-01T00:00:00Z",
    ends_at: "2026-10-01T00:00:00Z",
    title: "Example Network",
    description: "Join the event.",
    cta_label: "Play now",
    ...overrides,
  };
}

test("accepts an empty production catalog", () => {
  assert.deepEqual(validateFeaturedServers({ schema_version: 1, servers: [] }), []);
});

test("accepts solid, rainbow, and disabled outlines plus optional image", () => {
  const catalog = {
    schema_version: 1,
    ignored_future_field: true,
    servers: [
      server({ featured: featured() }),
      server({ id: "rainbow", address: "rainbow.example.net", outline_color: "rainbow", featured: featured({ campaign_id: "rainbow-campaign", image_url: "https://example.net/banner.webp" }) }),
      server({ id: "none", address: "none.example.net", outline_color: "none" }),
    ],
  };
  assert.deepEqual(validateFeaturedServers(catalog), []);
});

test("rejects malformed known values", () => {
  const errors = validateFeaturedServers({
    schema_version: 1,
    servers: [server({ outline_color: "gradient", featured: featured({ ends_at: "2026-08-01T00:00:00Z", image_url: "http://example.net/banner.png" }) })],
  });
  assert.ok(errors.some((error) => error.includes("outline_color")));
  assert.ok(errors.some((error) => error.includes("later than starts_at")));
  assert.ok(errors.some((error) => error.includes("HTTPS URL")));
});

test("accepts dismissible flags and rejects non-boolean ones", () => {
  assert.deepEqual(
    validateFeaturedServers({
      schema_version: 1,
      servers: [server({ featured: featured({ dismissible_in_main_menu: true, dismissible_in_server_list: false }) })],
    }),
    []
  );

  const errors = validateFeaturedServers({
    schema_version: 1,
    servers: [server({ featured: featured({ dismissible_in_main_menu: "yes", dismissible_in_server_list: 0 }) })],
  });
  assert.ok(errors.some((error) => error.includes("dismissible_in_main_menu must be a boolean")));
  assert.ok(errors.some((error) => error.includes("dismissible_in_server_list must be a boolean")));
});

test("rejects duplicate server and campaign ids", () => {
  const errors = validateFeaturedServers({
    schema_version: 1,
    servers: [server({ featured: featured() }), server({ featured: featured() })],
  });
  assert.ok(errors.some((error) => error.includes("id duplicates")));
  assert.ok(errors.some((error) => error.includes("campaign_id duplicates")));
});
