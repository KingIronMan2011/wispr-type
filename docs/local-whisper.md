# Local Whisper

Veskri can transcribe dictation entirely on your device through `whisper-rs`.
This mode does not need a Groq API key and never uploads dictation audio. It is
intended for users who prefer offline processing and accept the additional
model download, memory use, and local CPU or GPU work.

## Choose a model

Select **Local Whisper** in Settings, then download one of these models. The
RAM and VRAM values are practical planning estimates, not hardware guarantees:
drivers, operating systems, and audio length can change actual use. `English`
models only support English; the remaining models support multilingual
dictation.

| Model          |  Download | Free disk needed | Estimated RAM | Estimated VRAM | Best for                                     |
| -------------- | --------: | ---------------: | ------------: | -------------: | -------------------------------------------- |
| Tiny           |    75 MiB |          139 MiB |       350 MiB |        350 MiB | Fast, short notes                            |
| Base           |   142 MiB |          206 MiB |       550 MiB |        550 MiB | Everyday dictation                           |
| Small          |   466 MiB |          530 MiB |     1,200 MiB |      1,200 MiB | Better multilingual accuracy                 |
| Medium         | 1,463 MiB |        1,527 MiB |     3,000 MiB |      3,000 MiB | High multilingual accuracy                   |
| Large v3 Turbo | 1,550 MiB |        1,614 MiB |     3,500 MiB |      3,500 MiB | Recommended high-quality local transcription |
| Large v3       | 2,952 MiB |        3,016 MiB |     6,000 MiB |      6,000 MiB | Maximum current multilingual local accuracy  |

The app checks free disk space before downloading and free RAM before starting
local transcription. If either is insufficient, it explains the required and
available amount and leaves your existing model files untouched.

## Download integrity and storage

Models come from the official
[ggerganov/whisper.cpp Hugging Face repository](https://huggingface.co/ggerganov/whisper.cpp).
Each file is downloaded to a temporary `.part` file, checked against its pinned
SHA-256 digest and expected byte size, synced to disk, then atomically renamed.
An interrupted, oversized, incomplete, or invalid download is removed. Veskri
also prevents two downloads of the same model from writing concurrently.

Downloaded models live in Veskri’s application-data directory under `models/`.
They are not included in transcript history, diagnostics, or releases. Delete a
model from Settings to reclaim its disk space; **Reset local data** removes all
downloaded models as well.

## Acceleration and platform support

CPU inference is available on Windows, Linux, and macOS. Release builds for
Windows and Linux also include the optional Vulkan backend, which supports
compatible AMD, Intel, and NVIDIA GPUs. Choose **Automatic** to use the GPU
backend compiled into the app, or choose **CPU only** for the most portable
path.

Vulkan support is compiled into the Windows and Linux release artifacts; it is
not currently enabled in macOS release builds. Selecting a GPU backend does not
guarantee that every driver can create a Vulkan device. If the backend cannot
initialize, Veskri reports the native error; switch to CPU only to continue.

For NVIDIA systems on Windows or Linux, Veskri also supports a dedicated CUDA
build. CUDA is kept out of the default installers because it requires the
NVIDIA CUDA runtime and only benefits NVIDIA hardware. A CUDA build exposes
**CUDA GPU (NVIDIA)** in Settings and uses the same local models and privacy
guarantees. Build exactly one GPU backend per app: CUDA and Vulkan are
intentionally mutually exclusive.

For supported AMD GPUs on Linux, a dedicated ROCm/hipBLAS build is available.
It exposes **ROCm GPU (AMD, Linux)** in Settings. Upstream `whisper-rs` makes
this backend Linux-only, so it is deliberately absent from Windows and macOS
builds. ROCm hardware and distribution support is narrower than Vulkan; keep
the regular Vulkan build as the fallback for unsupported AMD systems.

## Build requirements

Local Whisper builds native `whisper.cpp` code. Alongside the normal Tauri
prerequisites, install CMake and LLVM/Clang with `libclang` available.

On Windows, use the MSVC C++ Build Tools and a supported Visual Studio 2022
generator. If another Visual Studio version makes CMake select an unavailable
generator, set this only for the current PowerShell session:

```powershell
$env:CMAKE_GENERATOR = "Visual Studio 17 2022"
pnpm dev
```

The Vulkan shader generator creates deeply nested build paths on Windows. If
MSBuild reports `FileTracker` or path-related errors, choose a short target
directory before building, for example:

```powershell
$env:CARGO_TARGET_DIR = "D:\\veskri-target"
```

For a Vulkan-enabled local build, install the Vulkan SDK and run:

```powershell
pnpm tauri build -- --features local-whisper-vulkan
```

For an NVIDIA CUDA build, install a matching NVIDIA driver and CUDA Toolkit,
verify the compiler with `nvcc -V`, then build:

```powershell
pnpm tauri build -- --features local-whisper-cuda
```

CUDA Toolkit installation is required at build time; end users of a CUDA build
need a compatible NVIDIA driver and GPU. See NVIDIA's
[Windows CUDA installation guide](https://docs.nvidia.com/cuda/cuda-installation-guide-microsoft-windows/index.html)
for supported driver, toolkit, and Visual Studio combinations.

For a Linux AMD ROCm build, first install ROCm including the HIP SDK and
hipBLAS for your supported distribution and GPU. The standard installation
path is `/opt/rocm`; if yours differs, set `HIP_PATH` to that location before
building. Then run:

```bash
pnpm tauri build -- --features local-whisper-rocm
```

Verify the installation with `/opt/rocm/bin/hipconfig --full` before building.
AMD's [ROCm Linux installation guide](https://rocm.docs.amd.com/projects/install-on-linux/en/latest/install/quick-start.html)
and [hipBLAS installation guide](https://rocm.docs.amd.com/projects/hipBLAS/en/develop/install/Linux_Install_Guide.html)
list the supported hardware, distributions, and packages.

On Linux, install the distribution packages for Clang/libclang, Vulkan headers
and shader compiler (`libvulkan-dev` and `glslc` on Ubuntu), plus the normal
Tauri/WebKitGTK/audio dependencies. The GitHub Actions CI and release workflow
install these dependencies automatically.
