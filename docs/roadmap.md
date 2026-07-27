# Product roadmap

This is the retained shortlist of product improvements discussed for Veskri.

## Next up

- Add a selectable auto-paste strategy: direct typing preserves the clipboard; clipboard paste maximises compatibility with restrictive applications.
- Complete Linux release signing: publish the public GPG key under `docs/keys/`, sign supported artifacts in CI, and document verification.
- Add a privacy-safe “copy diagnostics” action for failed recordings, microphone checks, and transcription requests.
- Add optional deterministic dictionary replacement rules in addition to Whisper's preferred-spellings prompt.
- Improve update UX with release notes, deferred installation, and an eventual beta channel.
- Complete the accessibility pass: keyboard navigation, focus states, screen-reader coverage, contrast review, and reduced-motion support.

## Distribution follow-up

- macOS runtime privacy metadata and cross-platform PR CI are now covered.
- macOS code signing and notarization remain intentionally deferred until an Apple Developer identity is available.
