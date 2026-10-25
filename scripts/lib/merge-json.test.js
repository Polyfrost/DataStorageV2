"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeJson } = require("./merge-json.js");

test("merges nested objects from both sides", () => {
  const merged = mergeJson(
    { version: 1, overrides: { a: { "+breaks": { x: "*" } } } },
    {
      version: 1,
      overrides: { a: { "+breaks": { y: "*" } }, b: { "-depends": { z: "*" } } },
    }
  );
  assert.deepEqual(merged, {
    version: 1,
    overrides: {
      a: { "+breaks": { x: "*", y: "*" } },
      b: { "-depends": { z: "*" } },
    },
  });
});

test("identical values are not conflicts", () => {
  const value = { overrides: { a: { "+breaks": { x: "<1.0" } } }, list: [1, 2] };
  assert.deepEqual(mergeJson(structuredClone(value), value), value);
});

test("conflicting scalars throw with their path", () => {
  assert.throws(
    () => mergeJson({ version: 1 }, { version: 2 }),
    /conflicting values at \$\.version: 1 vs 2/
  );
  assert.throws(
    () =>
      mergeJson(
        { overrides: { a: { "+breaks": { x: "*" } } } },
        { overrides: { a: { "+breaks": { x: "<2" } } } }
      ),
    /\$\.overrides\.a\.\+breaks\.x/
  );
});

test("object vs non-object and differing arrays throw", () => {
  assert.throws(() => mergeJson({ a: {} }, { a: 1 }), /\$\.a/);
  assert.throws(() => mergeJson({ a: [1] }, { a: [2] }), /\$\.a/);
});
