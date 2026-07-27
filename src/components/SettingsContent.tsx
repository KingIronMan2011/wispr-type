import { useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import {
  Check,
  CircleAlert,
  Copy,
  Cpu,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Keyboard,
  LoaderCircle,
  LockKeyhole,
  Mic,
  MonitorUp,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Select, Toggle } from "./Controls";
import {
  displayHotkey,
  type ApiKeyTestResult,
  type LocalWhisperCapabilities,
  type LocalWhisperModel,
  type PlatformCapabilities,
  type Settings,
} from "../types";

type Props = {
  settings: Settings;
  recording: boolean;
  transcribing: boolean;
  inputLevel: number;
  message: string;
  platformCapabilities: PlatformCapabilities;
  localWhisperModels: LocalWhisperModel[];
  localWhisperCapabilities: LocalWhisperCapabilities;
  downloadingLocalModel: string | null;
  localWhisperDownloadProgress: number | null;
  onDownloadLocalWhisperModel: (id: string) => void;
  onDeleteLocalWhisperModel: (id: string) => void;
  canRetry: boolean;
  isRetrying: boolean;
  isCheckingMicrophone: boolean;
  microphoneCheckResult: string | null;
  capturingHotkey: boolean;
  microphones: { value: string; label: string }[];
  onPersist: (settings: Settings) => Promise<boolean>;
  onCaptureHotkey: () => void;
  onRefreshMicrophones: () => void;
  onRunMicrophoneCheck: () => void;
  onRetry: () => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  showApiKey: boolean;
  onToggleApiKeyVisibility: () => void;
  hasApiKey: boolean;
  isSavingKey: boolean;
  isTestingKey: boolean;
  isDeletingKey: boolean;
  keyTest: ApiKeyTestResult | null;
  onSaveKey: () => void;
  onTestKey: () => void;
  onRemoveKey: () => void;
  onOpenGroqKeys: () => void;
  onOpenPrivacyInfo: () => void;
  onCopyDiagnostics: () => void;
  availableUpdate: Update | null;
  updateDeferred: boolean;
  isCheckingForUpdates: boolean;
  isInstallingUpdate: boolean;
  updateCheckMessage: string | null;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onDeferUpdate: () => void;
  onResetLocalData: () => void;
  onHistoryDisabled: () => void;
  settingsSectionRef: (node: HTMLDivElement | null) => void;
};

export default function SettingsContent({
  settings,
  recording,
  transcribing,
  inputLevel,
  message,
  platformCapabilities,
  localWhisperModels,
  localWhisperCapabilities,
  downloadingLocalModel,
  localWhisperDownloadProgress,
  onDownloadLocalWhisperModel,
  onDeleteLocalWhisperModel,
  canRetry,
  isRetrying,
  isCheckingMicrophone,
  microphoneCheckResult,
  capturingHotkey,
  microphones,
  onPersist,
  onCaptureHotkey,
  onRefreshMicrophones,
  onRunMicrophoneCheck,
  onRetry,
  apiKey,
  onApiKeyChange,
  showApiKey,
  onToggleApiKeyVisibility,
  hasApiKey,
  isSavingKey,
  isTestingKey,
  isDeletingKey,
  keyTest,
  onSaveKey,
  onTestKey,
  onRemoveKey,
  onOpenGroqKeys,
  onOpenPrivacyInfo,
  onCopyDiagnostics,
  availableUpdate,
  updateDeferred,
  isCheckingForUpdates,
  isInstallingUpdate,
  updateCheckMessage,
  onCheckForUpdates,
  onInstallUpdate,
  onDeferUpdate,
  onResetLocalData,
  onHistoryDisabled,
  settingsSectionRef,
}: Props) {
  const meterLevel = recording ? Math.max(inputLevel / 1000, 0.05) : 0.28;
  const persist = (next: Settings) => void onPersist(next);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);

  return (
    <div ref={settingsSectionRef} className="settings-section" id="settings">
      <header>
        <div>
          <p className="eyebrow">WORKSPACE</p>
          <h1>Settings</h1>
          <p className="subtitle">
            Set up a quieter, faster way to get your thoughts out.
          </p>
        </div>
        <div
          className={`status ${recording ? "live" : transcribing ? "thinking" : ""}`}
          role="status"
          aria-live="polite"
        >
          <span className="status-dot" aria-hidden="true" />
          {recording ? "Listening" : transcribing ? "Thinking" : "Ready"}
        </div>
      </header>
      <section className="command-card">
        <div className="command-icon">
          <Mic size={22} />
        </div>
        <div className="command-copy">
          <span className="section-kicker">YOUR COMMAND</span>
          <h2>{displayHotkey(settings.hotkey)}</h2>
          <p>
            {recording
              ? "Release to transcribe · Esc to cancel"
              : settings.inputMode === "hold"
                ? "Hold anywhere to dictate"
                : "Press to start or stop dictation"}
          </p>
        </div>
        <div
          className={`audio-bars ${recording ? "live" : ""}`}
          aria-label={recording ? "Live microphone level" : "Microphone level"}
          role="img"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((bar) => (
            <i
              key={bar}
              style={{
                height: `${Math.round(5 + meterLevel * (11 + ((bar * 17) % 31)))}px`,
              }}
            />
          ))}
        </div>
      </section>
      <div
        className={`notice ${recording || transcribing ? "active" : ""}`}
        role="status"
        aria-live="polite"
      >
        {transcribing && <LoaderCircle size={14} className="spin" />}
        {message}
        {canRetry && (
          <button
            type="button"
            className="notice-retry"
            onClick={onRetry}
            disabled={isRetrying || recording || transcribing}
          >
            {isRetrying ? "Retrying…" : "Retry"}
          </button>
        )}
      </div>
      <div className="settings-grid">
        <section className="panel shortcut-panel">
          <div className="panel-heading">
            <div>
              <Keyboard size={18} />
              <h3>Dictation</h3>
            </div>
            <span>Global shortcut</span>
          </div>
          <div className="setting-row">
            <div>
              <strong>Shortcut</strong>
              <p>
                Works from any app on {platformCapabilities.displayName}.
                {platformCapabilities.session === "wayland"
                  ? " Availability depends on your desktop session."
                  : ""}
              </p>
            </div>
            <button
              className="hotkey"
              type="button"
              onClick={onCaptureHotkey}
              aria-label={
                capturingHotkey
                  ? "Press a new global shortcut, or Escape to cancel"
                  : `Change global shortcut, currently ${displayHotkey(settings.hotkey)}`
              }
            >
              {capturingHotkey
                ? "Press shortcut…"
                : displayHotkey(settings.hotkey)}
            </button>
          </div>
          {!platformCapabilities.globalShortcutSupported && (
            <p className="platform-notice" role="status">
              Your desktop session did not grant a global shortcut. Open Veskri
              from the tray to dictate, or use your desktop environment’s
              shortcut configuration.
            </p>
          )}
          <div className="setting-row">
            <div>
              <strong>Dictation commands</strong>
              <p>Say “new paragraph”, “comma”, or “Punkt” while dictating.</p>
            </div>
            <Toggle
              label="Enable dictation commands"
              checked={settings.voiceCommandsEnabled}
              onChange={(voiceCommandsEnabled) =>
                persist({ ...settings, voiceCommandsEnabled })
              }
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>Interaction</strong>
              <p>Choose how recording begins and ends.</p>
            </div>
            <div
              className="segmented"
              role="group"
              aria-label="Dictation interaction"
            >
              <button
                type="button"
                aria-pressed={settings.inputMode === "hold"}
                className={settings.inputMode === "hold" ? "selected" : ""}
                onClick={() => persist({ ...settings, inputMode: "hold" })}
              >
                Hold to talk
              </button>
              <button
                type="button"
                aria-pressed={settings.inputMode === "toggle"}
                className={settings.inputMode === "toggle" ? "selected" : ""}
                onClick={() => persist({ ...settings, inputMode: "toggle" })}
              >
                Toggle
              </button>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <SlidersHorizontal size={18} />
              <h3>Audio & language</h3>
            </div>
            <button className="panel-action" onClick={onRefreshMicrophones}>
              Refresh
            </button>
          </div>
          <div className="setting-row">
            <div>
              <strong>Microphone</strong>
              <p>Refresh after connecting or reconnecting a device.</p>
            </div>
            <Select
              label="Microphone"
              value={settings.microphone}
              onChange={(microphone) => persist({ ...settings, microphone })}
              options={microphones}
            />
          </div>
          <div className="setting-row microphone-check-row">
            <div>
              <strong>Microphone check</strong>
              <p>
                {microphoneCheckResult ??
                  "Listen for two seconds without sending audio to Groq."}
              </p>
            </div>
            <button
              className="panel-action test-microphone"
              onClick={onRunMicrophoneCheck}
              disabled={isCheckingMicrophone || recording || transcribing}
            >
              {isCheckingMicrophone ? "Listening…" : "Test microphone"}
            </button>
          </div>
          <div className="setting-row">
            <div>
              <strong>Language</strong>
              <p>Whisper detects it automatically.</p>
            </div>
            <Select
              label="Language"
              value={settings.language}
              onChange={(language) => persist({ ...settings, language })}
              options={[
                { value: "auto", label: "Auto-detect" },
                { value: "en", label: "English" },
                { value: "de", label: "German" },
                { value: "es", label: "Spanish" },
                { value: "fr", label: "French" },
              ]}
            />
          </div>
        </section>
        <section className="panel transcription-panel">
          <div className="panel-heading">
            <div>
              <Cpu size={18} />
              <h3>Transcription</h3>
            </div>
          </div>
          <div className="setting-row provider-row">
            <div>
              <strong>Transcription provider</strong>
              <p>
                Groq is cloud-based. Local Whisper keeps audio on this device.
              </p>
            </div>
            <div
              className="segmented"
              role="group"
              aria-label="Transcription provider"
            >
              <button
                type="button"
                aria-pressed={settings.transcriptionProvider === "groq"}
                className={
                  settings.transcriptionProvider === "groq" ? "selected" : ""
                }
                onClick={() =>
                  persist({ ...settings, transcriptionProvider: "groq" })
                }
              >
                Groq
              </button>
              <button
                type="button"
                aria-pressed={settings.transcriptionProvider === "local"}
                className={
                  settings.transcriptionProvider === "local" ? "selected" : ""
                }
                onClick={() =>
                  persist({ ...settings, transcriptionProvider: "local" })
                }
              >
                Local Whisper
              </button>
            </div>
          </div>
          {settings.transcriptionProvider === "local" ? (
            <div className="local-whisper-settings">
              <div className="local-whisper-intro">
                <div>
                  <strong>Offline transcription</strong>
                  <p>
                    Download one model to dictate without a Groq API key. VRAM
                    estimates are approximate and vary by driver and audio
                    length.
                  </p>
                  <p className="local-whisper-resource-status">
                    {localWhisperCapabilities.availableMemoryMib > 0
                      ? `${localWhisperCapabilities.availableMemoryMib.toLocaleString()} MB RAM currently available`
                      : "Memory availability is checked before local transcription."}
                  </p>
                </div>
                <Select
                  label="Local Whisper acceleration"
                  value={settings.localWhisperAcceleration}
                  onChange={(localWhisperAcceleration) =>
                    persist({
                      ...settings,
                      localWhisperAcceleration:
                        localWhisperAcceleration as Settings["localWhisperAcceleration"],
                    })
                  }
                  options={[
                    { value: "auto", label: "Automatic" },
                    { value: "cpu", label: "CPU only" },
                    ...(localWhisperCapabilities.vulkanAvailable
                      ? [{ value: "vulkan", label: "Vulkan GPU" }]
                      : []),
                  ]}
                />
              </div>
              <div
                className="local-model-list"
                aria-label="Local Whisper models"
              >
                {localWhisperModels.map((model) => {
                  const selected = settings.localWhisperModel === model.id;
                  const downloading = downloadingLocalModel === model.id;
                  return (
                    <article
                      key={model.id}
                      className={selected ? "selected" : undefined}
                    >
                      <div className="local-model-copy">
                        <div>
                          <strong>{model.name}</strong>
                          {selected && <span>Selected</span>}
                        </div>
                        <p>{model.description}</p>
                        <dl>
                          <div>
                            <dt>Download</dt>
                            <dd>{model.downloadSizeMib} MB</dd>
                          </div>
                          <div>
                            <dt>RAM</dt>
                            <dd>≈ {model.estimatedRamMib} MB</dd>
                          </div>
                          <div>
                            <dt>GPU VRAM</dt>
                            <dd>≈ {model.estimatedVramMib} MB</dd>
                          </div>
                          <div>
                            <dt>Free disk</dt>
                            <dd>{model.requiredFreeDiskMib} MB</dd>
                          </div>
                        </dl>
                      </div>
                      <div className="local-model-actions">
                        <button
                          type="button"
                          className="local-model-select"
                          aria-pressed={selected}
                          onClick={() =>
                            persist({
                              ...settings,
                              localWhisperModel: model.id,
                            })
                          }
                        >
                          {selected ? "Selected" : "Use model"}
                        </button>
                        {model.installed ? (
                          <button
                            type="button"
                            className="local-model-delete"
                            onClick={() => onDeleteLocalWhisperModel(model.id)}
                            aria-label={`Delete ${model.name} local model`}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="local-model-download"
                            onClick={() =>
                              onDownloadLocalWhisperModel(model.id)
                            }
                            disabled={Boolean(downloadingLocalModel)}
                          >
                            {downloading ? (
                              <LoaderCircle className="spin" size={13} />
                            ) : (
                              <Download size={13} />
                            )}
                            {downloading
                              ? `Downloading ${localWhisperDownloadProgress ?? 0}%`
                              : "Download"}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="setting-row">
              <div>
                <strong>Groq model</strong>
                <p>Turbo is optimized for speed.</p>
              </div>
              <Select
                label="Model"
                value={settings.model}
                onChange={(model) =>
                  persist({ ...settings, model: model as Settings["model"] })
                }
                options={[
                  { value: "whisper-large-v3-turbo", label: "Large v3 Turbo" },
                  { value: "whisper-large-v3", label: "Large v3" },
                ]}
              />
            </div>
          )}
          <div className="setting-row">
            <div>
              <strong>After transcription</strong>
              <p>Auto-paste keeps your clipboard unchanged.</p>
            </div>
            <div
              className="segmented"
              role="group"
              aria-label="After transcription"
            >
              <button
                type="button"
                aria-pressed={
                  platformCapabilities.autoPasteSupported &&
                  settings.outputAction === "paste"
                }
                className={
                  platformCapabilities.autoPasteSupported &&
                  settings.outputAction === "paste"
                    ? "selected"
                    : ""
                }
                onClick={() => persist({ ...settings, outputAction: "paste" })}
                disabled={!platformCapabilities.autoPasteSupported}
                title={
                  platformCapabilities.autoPasteSupported
                    ? undefined
                    : "Auto-paste is unavailable in this Wayland session"
                }
              >
                Auto-paste
              </button>
              <button
                type="button"
                aria-pressed={
                  !platformCapabilities.autoPasteSupported ||
                  settings.outputAction === "copy"
                }
                className={
                  !platformCapabilities.autoPasteSupported ||
                  settings.outputAction === "copy"
                    ? "selected"
                    : ""
                }
                onClick={() => persist({ ...settings, outputAction: "copy" })}
              >
                Copy
              </button>
            </div>
          </div>
          {!platformCapabilities.autoPasteSupported && (
            <p className="platform-notice" role="status">
              Wayland blocks synthetic typing for security. Dictations will copy
              to the clipboard; use your app’s normal paste shortcut.
            </p>
          )}
          <div className="setting-row">
            <div>
              <strong>Text mode</strong>
              <p>
                Literal preserves the transcript; polished cleans spacing and
                casing.
              </p>
            </div>
            <div className="segmented" role="group" aria-label="Text mode">
              <button
                type="button"
                aria-pressed={settings.textMode === "literal"}
                className={settings.textMode === "literal" ? "selected" : ""}
                onClick={() => persist({ ...settings, textMode: "literal" })}
              >
                Literal
              </button>
              <button
                type="button"
                aria-pressed={settings.textMode === "polished"}
                className={settings.textMode === "polished" ? "selected" : ""}
                onClick={() => persist({ ...settings, textMode: "polished" })}
              >
                Polished
              </button>
            </div>
          </div>
          <div className="vocabulary-row">
            <div>
              <strong>Personal dictionary</strong>
              <p>
                Add names, product terms, or spellings to guide transcription.
              </p>
            </div>
            <textarea
              key={settings.personalVocabulary}
              className="vocabulary-input"
              defaultValue={settings.personalVocabulary}
              maxLength={650}
              placeholder="e.g. Veskri, Groq, your name, TypeScript"
              aria-label="Personal dictionary"
              onBlur={(event) => {
                const personalVocabulary = event.target.value;
                if (personalVocabulary !== settings.personalVocabulary)
                  persist({ ...settings, personalVocabulary });
              }}
            />
          </div>
          <div className="replacement-row">
            <div>
              <strong>Deterministic replacements</strong>
              <p>
                Apply literal, case-sensitive rules after transcription. Use one
                rule per line: <code>from =&gt; to</code>. Rules run from top to
                bottom.
              </p>
            </div>
            <textarea
              key={settings.dictionaryReplacements}
              className="replacement-input"
              defaultValue={settings.dictionaryReplacements}
              maxLength={4_000}
              placeholder={"Whisperflow => Veskri\nGroq cloud => GroqCloud"}
              aria-label="Deterministic dictionary replacements"
              spellCheck={false}
              onBlur={(event) => {
                const dictionaryReplacements = event.target.value;
                if (dictionaryReplacements !== settings.dictionaryReplacements)
                  persist({ ...settings, dictionaryReplacements });
              }}
            />
          </div>
        </section>
        <section className="panel security-panel">
          <div className="panel-heading">
            <div>
              <LockKeyhole size={18} />
              <h3>Groq API</h3>
            </div>
            <span className={hasApiKey ? "connected" : "disconnected"}>
              {hasApiKey ? "Connected" : "Needs key"}
            </span>
          </div>
          <p className="api-description">
            Your API key is encrypted by your operating system credential store.
            It is never written to your history or settings file.
          </p>
          <div className="api-key-entry">
            <div className="api-key-label">
              <label htmlFor="groq-api-key">Groq API key</label>
              <span>
                {hasApiKey ? "Stored securely" : "Required for dictation"}
              </span>
            </div>
            <div className="key-input">
              <input
                id="groq-api-key"
                value={apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
                type={showApiKey ? "text" : "password"}
                placeholder={hasApiKey ? "Paste a replacement key" : "gsk_…"}
                aria-label="Groq API key"
              />
              <button
                type="button"
                className="reveal-key"
                onClick={onToggleApiKeyVisibility}
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
                title={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div className="api-actions">
            <button
              type="button"
              className="test-key"
              onClick={onTestKey}
              disabled={isTestingKey || (!apiKey.trim() && !hasApiKey)}
            >
              {isTestingKey ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                "Test connection"
              )}
            </button>
            <button
              className="save-key"
              onClick={onSaveKey}
              disabled={isSavingKey || !apiKey.trim()}
            >
              {isSavingKey ? (
                <LoaderCircle className="spin" size={16} />
              ) : hasApiKey ? (
                "Replace"
              ) : (
                "Save key"
              )}
            </button>
            {hasApiKey && (
              <button
                className="remove-key"
                onClick={onRemoveKey}
                disabled={isDeletingKey}
              >
                {isDeletingKey ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  "Remove"
                )}
              </button>
            )}
          </div>
          {keyTest ? (
            <p className={`key-test ${keyTest.success ? "success" : "error"}`}>
              {keyTest.success ? (
                <Check size={13} />
              ) : (
                <CircleAlert size={13} />
              )}
              {keyTest.message}
            </p>
          ) : !hasApiKey ? (
            <p className="key-onboarding">
              1. Create a key · 2. Paste it here · 3. Test it · 4. Save it
              securely
            </p>
          ) : null}
          <div className="api-footer">
            <button
              type="button"
              className="inline-link"
              onClick={onOpenGroqKeys}
            >
              Get a Groq API key <ExternalLink size={13} />
            </button>
            <span>Testing never stores the entered key.</span>
          </div>
        </section>
        <section className="panel behavior-panel">
          <div className="panel-heading">
            <div>
              <MonitorUp size={18} />
              <h3>App behavior</h3>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <strong>Keep running in tray</strong>
              <p>Close the window without quitting.</p>
            </div>
            <Toggle
              label="Keep running in tray"
              checked={settings.keepRunningInTray}
              onChange={(keepRunningInTray) =>
                persist({ ...settings, keepRunningInTray })
              }
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>Launch at sign-in</strong>
              <p>Always have dictation ready.</p>
            </div>
            <Toggle
              label="Launch at sign-in"
              checked={settings.launchAtLogin}
              onChange={(launchAtLogin) =>
                persist({ ...settings, launchAtLogin })
              }
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>Start in tray</strong>
              <p>Hide the window when Veskri launches.</p>
            </div>
            <Toggle
              label="Start in tray"
              checked={settings.startInTray}
              onChange={(startInTray) => persist({ ...settings, startInTray })}
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>Native notifications</strong>
              <p>Show a native notification when dictation is complete.</p>
            </div>
            <Toggle
              label="Native notifications"
              checked={settings.notificationsEnabled}
              onChange={(notificationsEnabled) =>
                persist({ ...settings, notificationsEnabled })
              }
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>Install updates automatically</strong>
              <p>
                On launch, download, install, and restart when a newer version
                is available. Deferred updates stay manual.
              </p>
            </div>
            <Toggle
              label="Install updates automatically at startup"
              checked={settings.autoInstallUpdates}
              onChange={(autoInstallUpdates) =>
                persist({ ...settings, autoInstallUpdates })
              }
            />
          </div>
          <div className="setting-row update-row">
            <div>
              <strong>App updates</strong>
              <p>
                {availableUpdate
                  ? `Version ${availableUpdate.version} is ready to install.`
                  : (updateCheckMessage ??
                    "Checks automatically when Veskri starts.")}
              </p>
            </div>
            <div className="update-actions">
              <button
                className="update-button secondary"
                type="button"
                onClick={onCheckForUpdates}
                disabled={isCheckingForUpdates || isInstallingUpdate}
              >
                {isCheckingForUpdates ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <Check size={14} />
                )}
                {isCheckingForUpdates ? "Checking…" : "Check now"}
              </button>
              {availableUpdate && (
                <button
                  className="update-button"
                  type="button"
                  onClick={onInstallUpdate}
                  disabled={isInstallingUpdate}
                >
                  {isInstallingUpdate ? (
                    <LoaderCircle className="spin" size={14} />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {isInstallingUpdate
                    ? "Updating…"
                    : `Install ${availableUpdate.version}`}
                </button>
              )}
            </div>
          </div>
          {availableUpdate && (
            <div
              className="update-details"
              role="region"
              aria-label="Available update"
            >
              <div className="update-summary">
                <div>
                  <strong>Version {availableUpdate.version}</strong>
                  <p>
                    {updateDeferred
                      ? "Installation is deferred. It will not interrupt startup."
                      : "Ready to download and install."}
                  </p>
                </div>
                {availableUpdate.date && (
                  <span>
                    Released{" "}
                    {new Date(availableUpdate.date).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="update-detail-actions">
                <button
                  className="release-notes-toggle"
                  type="button"
                  aria-controls="update-release-notes"
                  aria-expanded={showReleaseNotes}
                  onClick={() => setShowReleaseNotes((visible) => !visible)}
                >
                  {showReleaseNotes ? "Hide release notes" : "Release notes"}
                </button>
                {!updateDeferred && (
                  <button
                    className="release-notes-toggle"
                    type="button"
                    onClick={onDeferUpdate}
                    disabled={isInstallingUpdate}
                  >
                    Install later
                  </button>
                )}
              </div>
              {showReleaseNotes && (
                <div id="update-release-notes" className="release-notes">
                  {availableUpdate.body?.trim() ||
                    "No release notes were included with this update."}
                </div>
              )}
            </div>
          )}
        </section>
        <section className="panel privacy-panel">
          <div className="panel-heading">
            <div>
              <ShieldCheck size={18} />
              <h3>Privacy & safety</h3>
            </div>
            <span>On this device</span>
          </div>
          <div className="setting-row">
            <div>
              <strong>Keep transcripts</strong>
              <p>
                Saved only on this device. Pinned items count toward the limit.
              </p>
            </div>
            <Select
              label="Transcript retention"
              value={settings.historyRetention}
              onChange={(historyRetention) => {
                const next = {
                  ...settings,
                  historyRetention:
                    historyRetention as Settings["historyRetention"],
                };
                void onPersist(next).then((saved) => {
                  if (saved && historyRetention === "never")
                    onHistoryDisabled();
                });
              }}
              options={[
                { value: "15", label: "Last 15" },
                { value: "30", label: "Last 30" },
                { value: "100", label: "Last 100" },
                { value: "500", label: "Last 500" },
                { value: "never", label: "Don’t save" },
              ]}
            />
          </div>
          <div className="privacy-notes">
            <span>
              {settings.transcriptionProvider === "local"
                ? "Local Whisper keeps dictation audio on this device. Veskri deletes temporary audio files after processing."
                : "Dictation audio is sent to Groq only to create a transcript. Veskri deletes temporary audio files after processing."}
            </span>
            <span>
              Transcript history stays in a local SQLite database; your API key
              stays in secure operating-system storage.
            </span>
            <span>
              Retention by Groq is governed by your Groq project’s data policy.
              Do not dictate sensitive data without your organisation’s
              approval.
            </span>
            <span>
              After a failure, audio is held in memory only so you can retry; it
              clears after success or when the app exits.
            </span>
          </div>
          <button
            className="privacy-link"
            type="button"
            onClick={onOpenPrivacyInfo}
          >
            Read Groq’s data-processing information <ExternalLink size={13} />
          </button>
          <div className="privacy-diagnostics">
            <div>
              <strong>Copy diagnostics</strong>
              <p>
                Share technical status for recording, microphone, or
                transcription problems. No text, audio, logs, device names, or
                API key is included.
              </p>
            </div>
            <button type="button" onClick={onCopyDiagnostics}>
              <Copy size={14} /> Copy diagnostics
            </button>
          </div>
          <div className="privacy-reset">
            <div>
              <strong>Reset local data</strong>
              <p>
                Delete the key, settings, history, downloaded local models, and
                launch-at-sign-in setting.
              </p>
            </div>
            <button onClick={onResetLocalData}>
              <Trash2 size={14} /> Reset app
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
