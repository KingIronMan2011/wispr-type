<!-- markdownlint-disable MD024 -->

# Releasing Veskri

Veskri uses Tauri's signed updater. An installed copy checks the repository's
`latest.json`, downloads a verified update, then runs the platform's installer.

## One-time GitHub setup

1. Keep `veskri-updater.key` private; it is ignored by Git.
2. Create the repository secret `TAURI_SIGNING_PRIVATE_KEY` with the full contents
   of that file. Do not add the key to source control or release assets.
3. The public counterpart is embedded in `tauri.conf.json` and is safe to commit.

## Publish a release

1. Update `version` in `package.json`, `src-tauri/Cargo.toml`, and
   `src-tauri/tauri.conf.json` to the same semantic version.
2. Create and push a matching tag, such as `v0.1.1`.
3. The GitHub Actions release workflow builds and uploads Windows and Linux
   installers plus Metal-accelerated macOS `.dmg` files for Apple Silicon and
   Intel. It signs the cross-platform updater packages, then publishes the
   multi-platform `latest.json` feed used by the app.

The workflow creates one draft release first, then runs the platform builds in
parallel and uploads their artifacts to that draft. It publishes the release
only after every required build has completed.

Before pushing the tag, run:

```powershell
pnpm metadata:check
pnpm format:check
pnpm types
pnpm lint
pnpm test:all
cargo check --manifest-path src-tauri/Cargo.toml --features local-whisper-vulkan
```

The regular Windows/Linux release artifacts deliberately use Vulkan rather than
CUDA so one build remains portable across compatible NVIDIA, AMD, and Intel
GPUs. The regular macOS artifacts use Metal. Every release also includes
separately named CUDA, ROCm, and Intel SYCL assets for users of those native
backends. Those provider-specific assets are manual-update variants and are
intentionally excluded from the in-app updater feed. To build the CUDA variant
locally, install the NVIDIA CUDA Toolkit and run:

```powershell
pnpm tauri build -- --features local-whisper-cuda
```

ROCm/hipBLAS is likewise a separate Linux AMD variant, not part of the updater
feed. Install ROCm with HIP and hipBLAS, then build it from a Linux environment:

```bash
pnpm tauri build -- --features local-whisper-rocm
```

Intel SYCL/oneAPI builds are likewise separately named manual-update assets for
Windows and Linux. They require the Intel oneAPI DPC++ compiler, oneMKL, and a
compatible Intel GPU driver; users should keep the normal Vulkan build if they
do not need the oneAPI runtime. Build them with:

```powershell
cmd /c 'call "C:\Program Files (x86)\Intel\oneAPI\setvars.bat" intel64 && pnpm run build:ci:windows-intel'
```

```bash
source /opt/intel/oneapi/setvars.sh
pnpm run build:ci:linux-intel
```

The release job also verifies `TAURI_SIGNING_PRIVATE_KEY` before building. A
missing or malformed updater-signing secret stops the draft release rather than
publishing incomplete artifacts.

## macOS status

The macOS artifacts include native Metal acceleration but are not Apple
code-signed or notarized yet. They are useful for local testing and early
adopters, but Gatekeeper will warn before opening them. The existing
`TAURI_SIGNING_PRIVATE_KEY` remains required: it signs the updater payloads and
is separate from Apple application signing.

For a local signed release build in PowerShell, load the ignored private key
into the same environment variable used by GitHub Actions before running
`pnpm build`:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw veskri-updater.key
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
pnpm build
```

## Linux GPG release signing

Every Linux AppImage, Debian, and RPM release asset receives a detached ASCII-armored GPG signature (`.asc`). The public key is committed at [docs/keys/veskri-linux-release-signing.asc](keys/veskri-linux-release-signing.asc).

Its authoritative fingerprint is:

```text
BE00 8179 7624 2ADA F028  F67A 3959 3B9B 2D74 D60A
```

The key's historical user ID says `Wispr Type Release Signing`; verify the fingerprint rather than relying on that label. It predates the Veskri rename and remains the release-signing identity until it is rotated.

### One-time GitHub setup

Create these repository secrets from the machine that holds the private GPG key:

- `LINUX_GPG_PRIVATE_KEY`: the complete ASCII-armored secret key export;
- `LINUX_GPG_PASSPHRASE`: its passphrase (use an empty secret only if the key deliberately has no passphrase).

For the current key, export it with:

```bash
gpg --armor --export-secret-keys BE00817976242ADAF028F67A39593B9B2D74D60A
```

The release workflow imports this key only on the ephemeral Linux runner, signs the AppImage, `.deb`, and `.rpm` files, uploads the `.asc` signatures to the draft release, then removes the temporary GPG home directory.

### Verify a Linux download

Download the artifact, its matching `.asc` file, and the committed public key. Then run:

```bash
gpg --import docs/keys/veskri-linux-release-signing.asc
gpg --fingerprint BE00817976242ADAF028F67A39593B9B2D74D60A
gpg --verify Veskri_1.4.2_amd64.deb.asc Veskri_1.4.2_amd64.deb
```

Replace the example filename with the downloaded AppImage, Debian, or RPM artifact. A good signature is only trustworthy when its fingerprint matches the value above.
