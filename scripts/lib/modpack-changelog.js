"use strict";

const path = require("node:path");

const CHANGELOG_PATH = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "oneclient",
  "MODPACK_CHANGELOG.md"
);

const REPO_URL = "https://github.com/Polyfrost/DataStorageV2";

const SECTION_ORDER = [
  "Added",
  "Changed",
  "Deprecated",
  "Removed",
  "Fixed",
  "Security",
];

const UNRELEASED = "Unreleased";
const RELEASE_HEADING_RE = /^## \[(\d+)\.(\d+)\.(\d+)\] - (\d{4}-\d{2}-\d{2})$/;
const ANY_RELEASE_HEADING_RE = /^## \[([^\]]+)\](?: - (.*))?$/;
const SECTION_HEADING_RE = /^### (.+)$/;
const LINK_REF_RE = /^\[([^\]]+)\]:\s*(\S+)\s*$/;
const COMPARE_RE = /\/compare\/([0-9a-fA-F]+|HEAD)\.\.\.([0-9a-fA-F]+|HEAD)$/;
const TREE_RE = /\/tree\/([0-9a-fA-F]+)$/;

function detectEol(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function parse(text) {
  const eol = detectEol(text);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const doc = {
    eol,
    header: [],
    unreleased: null,
    releases: [],
    links: [],
    problems: [],
    blockOrder: [],
  };

  let block = null;
  let section = null;
  let inHeader = true;

  lines.forEach((raw, index) => {
    const line = raw.replace(/\s+$/, "");
    const lineNo = index + 1;

    const link = line.match(LINK_REF_RE);
    if (link && !inHeader) {
      doc.links.push({ label: link[1], url: link[2], line: lineNo });
      return;
    }

    if (line.startsWith("## ")) {
      inHeader = false;
      section = null;
      const any = line.match(ANY_RELEASE_HEADING_RE);
      if (any && any[1] === UNRELEASED && any[2] === undefined) {
        block = { kind: "unreleased", sections: [], line: lineNo };
        if (doc.unreleased) {
          doc.problems.push({ line: lineNo, message: "Duplicate ## [Unreleased] section." });
        } else {
          doc.unreleased = block;
        }
        doc.blockOrder.push(block);
        return;
      }
      const match = line.match(RELEASE_HEADING_RE);
      block = {
        kind: "release",
        version: match ? `${match[1]}.${match[2]}.${match[3]}` : any ? any[1] : line.slice(3),
        date: match ? match[4] : any && any[2] ? any[2] : "",
        heading: line,
        valid: Boolean(match),
        sections: [],
        line: lineNo,
      };
      if (!match) {
        doc.problems.push({
          line: lineNo,
          message: `Release heading "${line}" must look like "## [x.y.z] - YYYY-MM-DD".`,
        });
      }
      doc.releases.push(block);
      doc.blockOrder.push(block);
      return;
    }

    if (inHeader) {
      doc.header.push(line);
      return;
    }

    const sectionMatch = line.match(SECTION_HEADING_RE);
    if (sectionMatch) {
      section = { name: sectionMatch[1], bullets: [], line: lineNo };
      block.sections.push(section);
      return;
    }

    if (line === "") return;

    if (!section) {
      doc.problems.push({
        line: lineNo,
        message: `Text outside a ### section: "${line}".`,
      });
      return;
    }

    section.bullets.push({ text: line, line: lineNo });
  });

  while (doc.header.length && doc.header[doc.header.length - 1] === "") {
    doc.header.pop();
  }

  return doc;
}

function orderedSections(sections) {
  const known = SECTION_ORDER.map((name) =>
    sections.filter((s) => s.name === name)
  ).flat();
  const unknown = sections.filter((s) => !SECTION_ORDER.includes(s.name));
  return [...known, ...unknown];
}

function serializeBlock(out, heading, sections) {
  out.push(heading, "");
  for (const section of orderedSections(sections)) {
    if (section.bullets.length === 0) continue;
    out.push(`### ${section.name}`, "");
    for (const bullet of section.bullets) out.push(bullet.text);
    out.push("");
  }
}

function serialize(doc) {
  const out = [...doc.header, ""];
  serializeBlock(out, `## [${UNRELEASED}]`, doc.unreleased ? doc.unreleased.sections : []);
  for (const release of doc.releases) {
    const heading = release.valid === false
      ? release.heading
      : `## [${release.version}] - ${release.date}`;
    serializeBlock(out, heading, release.sections);
  }
  for (const link of doc.links) out.push(`[${link.label}]: ${link.url}`);
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join(doc.eol) + doc.eol;
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function findLink(doc, label) {
  const wanted = label.toLowerCase();
  return doc.links.find((link) => link.label.toLowerCase() === wanted);
}

function linkHeadSha(url) {
  const compare = url.match(COMPARE_RE);
  if (compare) return compare[2];
  const tree = url.match(TREE_RE);
  if (tree) return tree[1];
  return null;
}

function repoUrlFrom(doc) {
  for (const link of doc.links) {
    const index = link.url.search(/\/(compare|tree)\//);
    if (index > 0) return link.url.slice(0, index);
  }
  return REPO_URL;
}

function validateSections(errors, block, label) {
  const seen = new Set();
  let lastIndex = -1;
  for (const section of block.sections) {
    const index = SECTION_ORDER.indexOf(section.name);
    if (index === -1) {
      errors.push({
        line: section.line,
        message: `${label}: unknown section "### ${section.name}". Use one of ${SECTION_ORDER.join(", ")}.`,
      });
      continue;
    }
    if (seen.has(section.name)) {
      errors.push({
        line: section.line,
        message: `${label}: duplicate "### ${section.name}" section.`,
      });
    }
    seen.add(section.name);
    if (index < lastIndex) {
      errors.push({
        line: section.line,
        message: `${label}: sections must be ordered ${SECTION_ORDER.join(", ")}.`,
      });
    }
    lastIndex = Math.max(lastIndex, index);
    if (section.bullets.length === 0) {
      errors.push({
        line: section.line,
        message: `${label}: "### ${section.name}" is empty.`,
      });
    }
    for (const bullet of section.bullets) {
      if (!bullet.text.startsWith("- ")) {
        errors.push({
          line: bullet.line,
          message: `${label}: entries must start with "- ": "${bullet.text}".`,
        });
      }
    }
  }
}

function validate(doc) {
  const errors = [...doc.problems];

  if (doc.header[0] !== "# Changelog") {
    errors.push({ line: 1, message: 'The file must start with "# Changelog".' });
  }
  if (!doc.header.some((line) => line.includes("https://keepachangelog.com/en/1.1.0/"))) {
    errors.push({ line: 1, message: "The header must link to Keep a Changelog 1.1.0." });
  }

  if (!doc.unreleased) {
    errors.push({ line: 1, message: "Missing a ## [Unreleased] section." });
  } else if (doc.blockOrder[0] !== doc.unreleased) {
    errors.push({
      line: doc.unreleased.line,
      message: "## [Unreleased] must be the first section after the header.",
    });
  }
  if (doc.unreleased) validateSections(errors, doc.unreleased, "Unreleased");

  let previous = null;
  for (const release of doc.releases) {
    if (!release.valid) continue;
    const label = release.version;
    if (previous) {
      if (compareVersions(release.version, previous.version) >= 0) {
        errors.push({
          line: release.line,
          message: `${label} must be lower than ${previous.version}; releases go newest first.`,
        });
      }
      if (release.date > previous.date) {
        errors.push({
          line: release.line,
          message: `${label} is dated ${release.date}, after the newer release ${previous.version} (${previous.date}).`,
        });
      }
    }
    previous = release;
    validateSections(errors, release, label);
    if (!findLink(doc, release.version)) {
      errors.push({
        line: release.line,
        message: `${label} has no link reference "[${release.version}]: ..." at the bottom of the file.`,
      });
    }
  }

  if (doc.releases.length && !findLink(doc, UNRELEASED)) {
    errors.push({ line: 1, message: 'Missing the "[unreleased]: ..." link reference.' });
  }

  const labels = new Set([
    UNRELEASED.toLowerCase(),
    ...doc.releases.map((r) => r.version.toLowerCase()),
  ]);
  const seenLinks = new Set();
  for (const link of doc.links) {
    const key = link.label.toLowerCase();
    if (!labels.has(key)) {
      errors.push({
        line: link.line,
        message: `Link reference [${link.label}] does not match any release.`,
      });
    } else if (seenLinks.has(key)) {
      errors.push({
        line: link.line,
        message: `Duplicate link reference [${link.label}].`,
      });
    }
    seenLinks.add(key);
  }

  return errors.sort((a, b) => a.line - b.line);
}

function unreleasedBullets(doc) {
  if (!doc.unreleased) return [];
  return doc.unreleased.sections.flatMap((section) =>
    section.bullets.map((bullet) => bullet.text)
  );
}

function previousReleaseSha(doc) {
  const top = doc.releases[0];
  if (!top) return null;
  const link = findLink(doc, top.version);
  return link ? linkHeadSha(link.url) : null;
}

function release(doc, version, date, sha, extraChangedBullets = []) {
  const number = version.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+$/.test(number)) {
    throw new Error(`Invalid version "${version}".`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date "${date}".`);
  }
  const top = doc.releases[0];
  if (top && compareVersions(number, top.version) <= 0) {
    throw new Error(`${number} is not newer than the latest release ${top.version}.`);
  }

  const repoUrl = repoUrlFrom(doc);
  const previousSha = previousReleaseSha(doc);
  if (top && !previousSha) {
    throw new Error(`Cannot read the commit of ${top.version} from its link reference.`);
  }

  const sections = doc.unreleased
    ? doc.unreleased.sections.map((s) => ({
        name: s.name,
        bullets: s.bullets.map((b) => ({ text: b.text })),
      }))
    : [];
  if (extraChangedBullets.length) {
    let changed = sections.find((s) => s.name === "Changed");
    if (!changed) {
      changed = { name: "Changed", bullets: [] };
      sections.push(changed);
    }
    for (const text of extraChangedBullets) changed.bullets.push({ text });
  }

  const entry = {
    kind: "release",
    version: number,
    date,
    valid: true,
    sections: orderedSections(sections),
  };
  doc.releases.unshift(entry);
  doc.unreleased = { kind: "unreleased", sections: [] };
  doc.blockOrder = [doc.unreleased, ...doc.releases];

  const others = doc.links.filter(
    (link) => link.label.toLowerCase() !== UNRELEASED.toLowerCase()
  );
  doc.links = [
    { label: UNRELEASED.toLowerCase(), url: `${repoUrl}/compare/${sha}...HEAD` },
    {
      label: number,
      url: previousSha
        ? `${repoUrl}/compare/${previousSha}...${sha}`
        : `${repoUrl}/tree/${sha}`,
    },
    ...others,
  ];

  return doc;
}

module.exports = {
  CHANGELOG_PATH,
  SECTION_ORDER,
  parse,
  serialize,
  validate,
  unreleasedBullets,
  previousReleaseSha,
  release,
};
