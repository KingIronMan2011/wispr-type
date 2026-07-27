import type { Update } from "@tauri-apps/plugin-updater";
import {
  Check,
  CircleAlert,
  Cpu,
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
  availableUpdate: Update | null;
  isInstallingUpdate: boolean;
  onInstallUpdate: () => void;
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
  availableUpdate,
  isInstallingUpdate,
  onInstallUpdate,
  onResetLocalData,
  onHistoryDisabled,
  settingsSectionRef,
}: Props) {
  const meterLevel = recording ? Math.max(inputLevel / 1000, 0.05) : 0.28;
  const persist = (next: Settings) => void onPersist(next);

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
        >
          <span className="status-dot" />
          {recording ? "Listening" : transcribing ? "Thinking" : "Ready"}
        </div>
        {availableUpdate && (
          <button
            className="update-button"
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
              : `Update ${availableUpdate.version}`}
          </button>
        )}
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
      <p className={`notice ${recording || transcribing ? "active" : ""}`}>
        {transcribing && <LoaderCircle size={14} className="spin" />}
        {message}
        {canRetry && (
          <button
            className="notice-retry"
            onClick={onRetry}
            disabled={isRetrying || recording || transcribing}
          >
            {isRetrying ? "Retrying…" : "Retry"}
          </button>
        )}
      </p>
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
            <button className="hotkey" onClick={onCaptureHotkey}>
              {capturingHotkey
                ? "Press shortcut…"
                : displayHotkey(settings.hotkey)}
            </button>
          </div>
          {!platformCapabilities.globalShortcutSupported && (
            <p className="platform-notice" role="status">
              Your desktop session did not grant a global shortcut. Open Wispr
              Type from the tray to dictate, or use your desktop environment’s
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
            <div className="segmented">
              <button
                className={settings.inputMode === "hold" ? "selected" : ""}
                onClick={() => persist({ ...settings, inputMode: "hold" })}
              >
                Hold to talk
              </button>
              <button
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
          <div className="setting-row">
            <div>
              <strong>After transcription</strong>
              <p>Auto-paste keeps your clipboard unchanged.</p>
            </div>
            <div className="segmented">
              <button
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
            <div className="segmented">
              <button
                className={settings.textMode === "literal" ? "selected" : ""}
                onClick={() => persist({ ...settings, textMode: "literal" })}
              >
                Literal
              </button>
              <button
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
              placeholder="e.g. Wispr Type, Groq, your name, TypeScript"
              aria-label="Personal dictionary"
              onBlur={(event) => {
                const personalVocabulary = event.target.value;
                if (personalVocabulary !== settings.personalVocabulary)
                  persist({ ...settings, personalVocabulary });
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
              <p>Hide the window when Wispr Type launches.</p>
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
              Dictation audio is sent to Groq only to create a transcript. Wispr
              Type deletes its temporary audio files after processing.
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
          <div className="privacy-reset">
            <div>
              <strong>Reset local data</strong>
              <p>
                Delete the key, settings, history, and launch-at-sign-in
                setting.
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
