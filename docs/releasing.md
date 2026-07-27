# Releasing Wispr Type

Wispr Type uses Tauri's signed updater. An installed copy checks the repository's
`latest.json`, downloads a verified update, then runs the platform's installer.

## One-time GitHub setup

1. Keep `src-tauri/keys/wispr-type-updater.key` private; it is ignored by Git.
2. Create the repository secret `TAURI_SIGNING_PRIVATE_KEY` with the full contents
   of that file. Do not add the key to source control or release assets.
3. The public counterpart is embedded in `tauri.conf.json` and is safe to commit.

## Publish a release

1. Update `version` in `package.json`, `src-tauri/Cargo.toml`, and
   `src-tauri/tauri.conf.json` to the same semantic version.
2. Create and push a matching tag, such as `v0.1.1`.
3. The GitHub Actions release workflow builds and uploads Windows and Linux
   installers plus macOS `.dmg` files for Apple Silicon and Intel. It signs the
   cross-platform updater packages, then publishes the multi-platform
   `latest.json` feed used by the app.

## macOS status

The macOS artifacts are not Apple code-signed or notarized yet. They are useful
for local testing and early adopters, but Gatekeeper will warn before opening
them. The existing `TAURI_SIGNING_PRIVATE_KEY` remains required: it signs the
updater payloads and is separate from Apple application signing.

For a local signed release build in PowerShell, load the ignored private key
into the same environment variable used by GitHub Actions before running
`pnpm build`:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw src-tauri\keys\wispr-type-updater.key
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
pnpm build
```
