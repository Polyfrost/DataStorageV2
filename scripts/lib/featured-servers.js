"use strict";

const IDENTIFIER = /^[a-z0-9][a-z0-9._-]*$/;
const OUTLINE = /^(?:#[0-9a-fA-F]{6}|rainbow|none)$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function utcInstant(value) {
  if (!nonEmptyString(value) || !UTC_INSTANT.test(value)) return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
}

function validateFeaturedServers(catalog) {
  const errors = [];
  if (!isRecord(catalog)) return ["catalog must be a JSON object"];

  if (catalog.schema_version !== 1) {
    errors.push("schema_version must be 1");
  }
  if (!Array.isArray(catalog.servers)) {
    errors.push("servers must be an array");
    return errors;
  }

  const serverIds = new Set();
  const campaignIds = new Set();
  catalog.servers.forEach((server, index) => {
    const at = `servers[${index}]`;
    if (!isRecord(server)) {
      errors.push(`${at} must be an object`);
      return;
    }

    for (const field of ["id", "name", "address", "outline_color"]) {
      if (!nonEmptyString(server[field])) errors.push(`${at}.${field} must be a non-empty string`);
    }

    if (nonEmptyString(server.id)) {
      if (!IDENTIFIER.test(server.id)) errors.push(`${at}.id must match ${IDENTIFIER}`);
      if (serverIds.has(server.id)) errors.push(`${at}.id duplicates ${server.id}`);
      serverIds.add(server.id);
    }
    if (nonEmptyString(server.address) && /\s/.test(server.address)) {
      errors.push(`${at}.address must not contain whitespace`);
    }
    if (nonEmptyString(server.outline_color) && !OUTLINE.test(server.outline_color)) {
      errors.push(`${at}.outline_color must be #RRGGBB, rainbow, or none`);
    }

    if (server.featured === undefined) return;
    if (!isRecord(server.featured)) {
      errors.push(`${at}.featured must be an object when present`);
      return;
    }

    const featured = server.featured;
    for (const field of ["campaign_id", "starts_at", "ends_at", "title", "description", "cta_label"]) {
      if (!nonEmptyString(featured[field])) errors.push(`${at}.featured.${field} must be a non-empty string`);
    }

    if (nonEmptyString(featured.campaign_id)) {
      if (!IDENTIFIER.test(featured.campaign_id)) {
        errors.push(`${at}.featured.campaign_id must match ${IDENTIFIER}`);
      }
      if (campaignIds.has(featured.campaign_id)) {
        errors.push(`${at}.featured.campaign_id duplicates ${featured.campaign_id}`);
      }
      campaignIds.add(featured.campaign_id);
    }

    const startsAt = utcInstant(featured.starts_at);
    const endsAt = utcInstant(featured.ends_at);
    if (startsAt === null) errors.push(`${at}.featured.starts_at must be a UTC ISO-8601 instant`);
    if (endsAt === null) errors.push(`${at}.featured.ends_at must be a UTC ISO-8601 instant`);
    if (startsAt !== null && endsAt !== null && endsAt <= startsAt) {
      errors.push(`${at}.featured.ends_at must be later than starts_at`);
    }

    for (const field of ["dismissible_in_main_menu", "dismissible_in_server_list"]) {
      if (featured[field] !== undefined && typeof featured[field] !== "boolean") {
        errors.push(`${at}.featured.${field} must be a boolean when present`);
      }
    }

    if (featured.image_url !== undefined) {
      if (!nonEmptyString(featured.image_url)) {
        errors.push(`${at}.featured.image_url must be a non-empty HTTPS URL when present`);
      } else {
        try {
          if (new URL(featured.image_url).protocol !== "https:") throw new Error("not https");
        } catch {
          errors.push(`${at}.featured.image_url must be a non-empty HTTPS URL when present`);
        }
      }
    }
  });

  return errors;
}

module.exports = { validateFeaturedServers };
