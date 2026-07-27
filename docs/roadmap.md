# Product roadmap

This is the retained shortlist of product improvements discussed for Veskri.

## Next up

- Add a selectable auto-paste strategy: direct typing preserves the clipboard; clipboard paste maximises compatibility with restrictive applications.
- Add optional deterministic dictionary replacement rules in addition to Whisper's preferred-spellings prompt.
- Improve update UX with release notes, deferred installation, and an eventual beta channel.
- Complete the accessibility pass: keyboard navigation, focus states, screen-reader coverage, contrast review, and reduced-motion support.

## Distribution follow-up

- Linux AppImage, Debian, and RPM artifacts are signed in CI with detached GPG signatures. The public key and verification steps are in [the release guide](releasing.md#linux-gpg-release-signing).
- The Privacy & safety panel can copy diagnostics for recording, microphone, and transcription failures without including user content or secrets.
- macOS runtime privacy metadata and cross-platform PR CI are now covered.
- macOS code signing and notarization remain intentionally deferred until an Apple Developer identity is available.
