# DataStorageV2
> Version 2 of the [old DataStorage](https://github.com/Polyfrost/DataStorage)

Place for storing data for Polyfrost projects such as [OneClient](https://github.com/Polyfrost/OneLauncher)

**To contribute to the OneClient packwiz modpacks, please use [this fork](https://github.com/Polyfrost/packwiz)
which adds additional fields to the modpack metadata for better integration with OneClient.**

## Third-party OneConfig mod categories

You can add your own mod to [this JSON file](https://github.com/Polyfrost/DataStorageV2/blob/main/data/oneconfig/third-party-mod-categories.json) to place it in a OneConfig category without supporting it directly. Simply make a PR and we'll approve it. The ID format is mod name, spaces replaced with dashes, all lowercase.

## Modpack changelog

[`data/oneclient/MODPACK_CHANGELOG.md`](data/oneclient/MODPACK_CHANGELOG.md) is the changelog players see for the OneClient modpack. It follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

- When a PR changes a bundle in a way players will notice, add a line under `## [Unreleased]` in the right section (`### Added`, `### Changed`, `### Removed`, `### Fixed`, ...).
- Write it in plain English for players and use the mod display names, for example `- Added Polydium to the Performance bundle.`
- Routine version bumps are listed automatically under `### Changed`, one line per mod with the old and new version and a link to the Modrinth changelog when it has one. You only need a line when you want to call one out, and a mod you name in your own line is left out of the automatic list.
- If a PR touches the bundles but needs no entry, add the `no-changelog` label. Otherwise the Check Changelog workflow fails.
- Releases are cut automatically. When a new modpack build is published to Modrinth, the Unreleased entries move under that build number.
