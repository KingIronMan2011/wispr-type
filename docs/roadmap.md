# Product roadmap

This is the retained shortlist of product improvements discussed for Veskri.

## Next up

- Add a richer transcript editor, including optional bulk actions and export.
- Explore an opt-in push-to-mute integration for voice calls: mute supported apps such as Discord while Veskri is recording, then restore the prior mute state afterwards.
- Expand Local Whisper with optional native GPU backends: CUDA for NVIDIA, HIPBLAS/ROCm for AMD, and Intel SYCL/oneAPI for Intel GPUs. Keep CPU and Vulkan as portable fallbacks, and avoid bloating the default installer through provider-specific build variants or optional downloads.

## Distribution follow-up

- macOS code signing and notarization remain intentionally deferred until an Apple Developer identity is available.
