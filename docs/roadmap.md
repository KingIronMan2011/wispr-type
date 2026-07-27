# Product roadmap

This is the retained shortlist of product improvements discussed for Veskri.

## Next up

- Add a selectable auto-paste strategy: direct typing preserves the clipboard; clipboard paste maximises compatibility with restrictive applications.
- Add a richer transcript editor, including optional bulk actions and export.
- Add optional local-only language and text-processing controls for users who need a stricter privacy posture.
- Consider a selectable direct-typing versus clipboard-paste strategy after more cross-platform testing.
- Explore an opt-in push-to-mute integration for voice calls: mute supported apps such as Discord while Veskri is recording, then restore the prior mute state afterwards.

## Recently completed

- Deterministic, literal dictionary replacement rules that run in user-defined order after transcription processing.
- Update UX with release notes, deferred installation, manual checks, and an opt-in automatic install check at startup. There is intentionally no beta channel.
- Accessibility pass covering visible keyboard focus, semantic switches and button groups, live status announcements, screen-reader labels, keyboard transcript editing, contrast improvements, skip navigation, and reduced-motion support.
- Local Whisper with verified model downloads, model management, offline CPU transcription, and optional Vulkan release builds for Windows and Linux.

## Distribution follow-up

- Linux AppImage, Debian, and RPM artifacts are signed in CI with detached GPG signatures. The public key and verification steps are in [the release guide](releasing.md#linux-gpg-release-signing).
- The Privacy & safety panel can copy diagnostics for recording, microphone, and transcription failures without including user content or secrets.
- macOS runtime privacy metadata and cross-platform PR CI are now covered.
- macOS code signing and notarization remain intentionally deferred until an Apple Developer identity is available.
- CPU Local Whisper has been manually verified. The Vulkan runtime check remains a post-cloud-build validation step; it is not a blocker for the current release.
