# Wonder Release Guide

This guide documents the manual Windows release flow for Wonder v0.1.0.

## Release Target

- Repository: `https://github.com/BZ2116/wonder`
- Version: `0.1.0`
- Git tag: `v0.1.0`
- Platform: Windows
- Installer: Tauri NSIS setup executable
- Auto-update: deferred until a later release

## Prerequisites

Install the local build tools before packaging:

- Node.js 18 or newer
- Rust stable toolchain
- Tauri Windows build prerequisites
- Git

Install dependencies:

```powershell
npm install
```

## Pre-Release Checks

Check the working tree before building:

```powershell
git status --short
```

Run the verification commands:

```powershell
npm run test
npm run build
npm run tauri:build
```

The Windows installer should be generated under:

```txt
src-tauri/target/release/bundle/nsis/
```

List the generated installer:

```powershell
Get-ChildItem -Path src-tauri/target/release/bundle/nsis -Filter *.exe
```

## GitHub Remote

The release repository should be:

```powershell
git remote set-url origin https://github.com/BZ2116/wonder.git
git remote -v
```

## Commit And Tag

Stage release metadata and documentation deliberately. Do not stage runtime data folders such as `data/`, `backend/data/`, or generated build outputs.

```powershell
git add .gitignore package.json package-lock.json src-tauri/Cargo.toml src-tauri/tauri.conf.json README.md docs/release.md
git commit -m "chore: prepare v0.1.0 windows release"
git tag v0.1.0
```

Push the branch and tag:

```powershell
git push origin main
git push origin v0.1.0
```

## Create GitHub Release

On GitHub, create a new release from tag `v0.1.0`:

- Title: `Wonder v0.1.0`
- Target: `main`
- Attach the generated setup executable from `src-tauri/target/release/bundle/nsis/`

Suggested release notes:

```markdown
## Wonder v0.1.0

Initial Windows desktop release.

### Highlights
- Single-document AI literature analysis
- Batch comparison matrix
- RAG knowledge base and traceable QA
- Literature discovery and citation network tools
- Local history, settings, and export helpers

### Install
Download the Windows setup executable from this release and run it.

### Notes
- Windows only for this release.
- In-app updates are not included yet.
- Unsigned installer builds may trigger a Windows SmartScreen warning.
```

## Future Update Path

When automatic updates become necessary, add Tauri updater support in a later release:

- `@tauri-apps/plugin-updater`
- `tauri-plugin-updater`
- updater signing keys stored outside the repository
- GitHub Release updater manifest
- a settings-page update check UI
