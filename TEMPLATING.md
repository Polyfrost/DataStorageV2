# JSON templating

Files under `data/` are published to GitHub Pages. Any `.json` file may use
`${ ... }` placeholders that are resolved at build time by
[`scripts/template.js`](scripts/template.js). Strings without `${ ... }` are left
untouched, so templating is opt-in per value.

Any path beginning with `/` refers to the root of the `data/` folder (the built
site root), e.g. `/oneclient/bundles/stable/foo.mrpack`.

## Syntax

A placeholder is `${` + a JavaScript expression + `}`. The expression result is
substituted into the string. Multiple placeholders per string are allowed, and a
placeholder may be part of a larger string.

### Available names

| Name         | Meaning                                                          |
| ------------ | ---------------------------------------------------------------- |
| `this`       | The object that directly contains the string being resolved.     |
| `super`      | The parent of `this`.                                            |
| `sha1(path)` | Sha1 hex digest of the file at the given `/`-rooted data path.    |

`this` and `super` give a value access to its siblings, similar to a current
working directory. Sibling values are resolved lazily, so a field can reference
another field — e.g. `sha1(this.path)` hashes whatever `path` points to.

`sha1(path)` reads the file relative to the data root: `/oneclient/foo.mrpack`
resolves to `<data>/oneclient/foo.mrpack`.

## Example

```json
{
  "path": "/oneclient/bundles/stable/hud-1.21.1-fabric.mrpack",
  "sha1": "${sha1(this.path)}"
}
```

renders to:

```json
{
  "path": "/oneclient/bundles/stable/hud-1.21.1-fabric.mrpack",
  "sha1": "5073040981898d4cef294e4f4d6c1bbe6179c6df"
}
```

## Running

```sh
node scripts/template.js <siteRoot>
```

`scripts/build-site.sh` runs this automatically over the built `_site`, and the
Deploy workflow runs `build-site.sh` (see `.github/workflows/deploy.yaml`).

## Extending

Add a variable or function in `buildScope` inside
[`scripts/template.js`](scripts/template.js) — one line each. New names are
immediately usable in any `${ ... }` expression. The engine is intentionally
small; keep additions pure and side-effect free.
