# GitHub-hosted mods

Bundle mods are normally Modrinth projects. A **GitHub-hosted mod** is a mod whose jar comes from a GitHub
release asset instead. It is tracked by packwiz through `[update.github]` and has no `[update.modrinth]`
section.

Each mod is one `.pw.toml` file in `data/oneclient/bundles/.mrpacks/<version>/<Bundle>/mods/`. The file is
created by `packwiz github add Owner/Repo` from the
[Polyfrost packwiz fork](https://github.com/Polyfrost/packwiz), which adds the `id`, `enabled`, `hidden`,
`type` and `[overrides]` fields.

## Example

```toml
id = "polyfrost-foo"
enabled = true
hidden = false
name = "Foo"
filename = "Foo-1.21.11-1.0.0.jar"
side = "client"
type = "normal"

[overrides]
name = "Foo"
description = "What the mod does"
authors = ["Polyfrost"]
icon = "https://raw.githubusercontent.com/Owner/Repo/main/icon.png"

[download]
url = "https://github.com/Owner/Repo/releases/download/v1.0.0/Foo-1.21.11-1.0.0.jar"
hash-format = "sha256"
hash = "..."

[update]
[update.github]
slug = "Owner/Repo"
tag = "v1.0.0"
branch = "main"
regex = "^Foo-1\\.21\\.11-.+\\.jar$"
```

## Top-level fields

| Field | Type | Set by | Description |
| --- | --- | --- | --- |
| `id` | string | `github add` prompt (default: repo name) | The mod's identity in OneClient. Must be the same in every version folder and must never change after the mod has shipped. If it changes, the launcher treats it as a different mod and users' choices are lost. It must not be a Modrinth project id. If it's missing, the launcher falls back to identifying the file by its sha1, so every new release looks like a different mod. |
| `enabled` | bool | `github add` prompt (default `true`) | Whether the mod is enabled by default when the bundle is installed. |
| `hidden` | bool | `github add` prompt (default `false`) | Hides the mod in the launcher UI. A mod that is hidden in every bundle is left out of `mods.json`. |
| `name` | string | `github add` (repo name) | packwiz's own name for the file. The name shown to users comes from `overrides.name`. |
| `filename` | string | `github add` / updater | The jar's filename. It's also the file path in the exported `.mrpack` (`mods/<filename>`). |
| `side` | `"client"` \| `"server"` \| `"both"` | `github add` writes `"both"` | Where the mod runs. Exported to the `.mrpack` as `env` (`"client"` means client required, server unsupported). Most bundle mods are `"client"`. |
| `type` | `"normal"` \| `"advanced"` | not set by `github add` | OneClient mod category. Every other bundle mod has one, so set it by hand. It's exported to the `.mrpack` as `type` (empty if missing). |
| `pin` | bool | `packwiz pin` | Optional. A pinned mod is skipped by `packwiz update`. |

## `[overrides]`

Display metadata. Modrinth mods get this from the Modrinth API; GitHub mods have no API to fall back on,
so these fields are the only source. `github add` doesn't write this section.

| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Display name in the launcher and on the website. |
| `description` | string | Short description. |
| `authors` | list of strings | Authors. Must be a list, even with one author (`["Polyfrost"]`). |
| `icon` | string (URL) | Direct URL to an image, downloaded as-is by the launcher. Without it, the mod is left out of `mods.json`. |

All four are copied into the mod's `overrides` object in the exported `modrinth.index.json`.

## `[download]`

Where the jar is downloaded from. Written by `github add` and rewritten by the updater on every new release.

| Field | Type | Description |
| --- | --- | --- |
| `url` | string | The release asset's download URL (`https://github.com/<slug>/releases/download/<tag>/<asset>`). Exported as the file's `downloads` entry. `github.com` is on packwiz's allowed-hosts list, so the file is included in the `.mrpack` as a normal download. |
| `hash-format` | string | `"sha256"` for GitHub mods (Modrinth mods use `"sha512"`). |
| `hash` | string | Hash of the jar. packwiz computes the sha1 and sha512 in the `.mrpack` from the downloaded jar at export time. |

## `[update.github]`

Tells packwiz how to find new versions. Written by `github add`. `tag` changes on every update; the other
fields stay the same.

| Field | Type | Description |
| --- | --- | --- |
| `slug` | string | The repository, `Owner/Repo`. Also used for the mod's website link (`https://github.com/<slug>`). |
| `tag` | string | The release currently in use. |
| `branch` | string | Only releases whose target branch equals this are considered. Always recorded (from the release's target branch, or `--branch`). For repos that release each MC version from its own branch, this is what keeps a folder on its MC version. |
| `regex` | string | Selects the jar among the release's assets. Exactly one asset must match. Defaults to any `.jar` except `-api`, `-dev`, `-dev-preshadow` and `-sources` jars; set with `--regex` when a release contains jars for several MC versions. |

## Updates

The hourly `Update Bundles` workflow runs `packwiz update --stable` on every bundle, so GitHub mods only
move to **stable** releases (not drafts or pre-releases). A mod whose `.pw.toml` basename is listed in
`BETA_MODS` in `scripts/update-bundles.sh` also follows pre-releases.

On an update, `tag`, `filename`, `url` and `hash` change and `id` stays the same, so the launcher treats it as
an update of the same mod and keeps the user's enable/disable choice.

packwiz reads its GitHub token from the `PACKWIZ_GITHUB_TOKEN` environment variable. Without one it's
limited to 60 GitHub API requests per hour, and update checks fail with `Failed to check updates for`.

## Website (`mods.json`)

`scripts/generate-mods-json.js` treats a mod as GitHub-hosted when it has `[update.github]` and no
`[update.modrinth]`. For those mods:

| `mods.json` field | Source |
| --- | --- |
| `id` | `id` (falls back to `update.github.slug`) |
| `name` | `overrides.name` (falls back to `name`) |
| `description`, `authors` | `overrides.description`, `overrides.authors` |
| `icon` | `overrides.icon` |
| `link` | `https://github.com/<update.github.slug>` |
| `slug` | the `.pw.toml` filename without extension |
| `type` | `mod` |

They are not looked up on Modrinth.
