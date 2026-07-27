import { useEffect, useState } from "react";
import {
  Check,
  Cloud,
  Download,
  HardDrive,
  KeyRound,
  LoaderCircle,
  Mic,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { LocalWhisperModel, Settings } from "../types";

type Provider = Settings["transcriptionProvider"];

type Props = {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  settings: Settings;
  localWhisperModels: LocalWhisperModel[];
  downloadingLocalModel: string | null;
  localWhisperDownloadProgress: number | null;
  onCompleteGroq: () => void;
  onCompleteLocal: (model: Settings["localWhisperModel"]) => void;
  onContinueWithoutSetup: (provider: Provider) => void;
  saving: boolean;
};

export default function FirstRunOnboarding({
  apiKey,
  onApiKeyChange,
  settings,
  localWhisperModels,
  downloadingLocalModel,
  localWhisperDownloadProgress,
  onCompleteGroq,
  onCompleteLocal,
  onContinueWithoutSetup,
  saving,
}: Props) {
  const [provider, setProvider] = useState<Provider>(
    settings.transcriptionProvider,
  );
  const [localModel, setLocalModel] = useState<Settings["localWhisperModel"]>(
    settings.localWhisperModel,
  );
  const selectedLocalModel = localWhisperModels.find(
    (model) => model.id === localModel,
  );
  const downloading = downloadingLocalModel === localModel;

  useEffect(() => {
    if (selectedLocalModel || localWhisperModels.length === 0) return;
    setLocalModel(localWhisperModels[0].id);
  }, [localWhisperModels, selectedLocalModel]);

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card" aria-labelledby="onboarding-title">
        <div className="onboarding-mark">
          <Mic size={22} aria-hidden="true" />
        </div>
        <p className="eyebrow">WELCOME TO VESKRI</p>
        <h1 id="onboarding-title">Choose how Veskri transcribes.</h1>
        <p className="onboarding-copy">
          Start with Groq for fast cloud transcription or Local Whisper for
          fully offline dictation. You can switch at any time.
        </p>

        <div
          className="onboarding-provider-options"
          role="radiogroup"
          aria-label="Transcription provider"
        >
          <button
            type="button"
            className={provider === "groq" ? "selected" : undefined}
            role="radio"
            aria-checked={provider === "groq"}
            onClick={() => setProvider("groq")}
          >
            <Cloud size={17} aria-hidden="true" />
            <span>
              <strong>Groq Cloud</strong>
              <small>Fastest results with an API key</small>
            </span>
            {provider === "groq" && <Check size={15} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className={provider === "local" ? "selected" : undefined}
            role="radio"
            aria-checked={provider === "local"}
            onClick={() => setProvider("local")}
          >
            <HardDrive size={17} aria-hidden="true" />
            <span>
              <strong>Local Whisper</strong>
              <small>Offline, private, and API-key free</small>
            </span>
            {provider === "local" && <Check size={15} aria-hidden="true" />}
          </button>
        </div>

        {provider === "groq" ? (
          <div className="onboarding-setup">
            <label className="onboarding-key">
              <span>
                <KeyRound size={14} /> Groq API key
              </span>
              <input
                value={apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
                type="password"
                placeholder="gsk_…"
                autoFocus
              />
            </label>
            <button
              type="button"
              className="onboarding-primary"
              onClick={onCompleteGroq}
              disabled={!apiKey.trim() || saving}
            >
              {saving ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              Save securely and continue
            </button>
            <button
              type="button"
              className="onboarding-secondary"
              onClick={() => onContinueWithoutSetup("groq")}
              disabled={saving}
            >
              Set up a key later
            </button>
            <div className="onboarding-note">
              <ShieldCheck size={15} /> Your key is stored in secure
              operating-system storage, never in the app settings.
            </div>
          </div>
        ) : (
          <div className="onboarding-setup onboarding-local-setup">
            {selectedLocalModel ? (
              <>
                <label className="onboarding-model-select">
                  <span>Local Whisper model</span>
                  <select
                    value={localModel}
                    onChange={(event) =>
                      setLocalModel(
                        event.target.value as Settings["localWhisperModel"],
                      )
                    }
                  >
                    {localWhisperModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} · {model.downloadSizeMib} MB
                      </option>
                    ))}
                  </select>
                </label>
                <div className="onboarding-model-details">
                  <p>{selectedLocalModel.description}</p>
                  <span>
                    {selectedLocalModel.installed
                      ? "Downloaded and ready"
                      : `${selectedLocalModel.downloadSizeMib} MB download · ≈ ${selectedLocalModel.estimatedRamMib.toLocaleString()} MB RAM`}
                  </span>
                </div>
                <button
                  type="button"
                  className="onboarding-primary"
                  onClick={() => onCompleteLocal(selectedLocalModel.id)}
                  disabled={Boolean(downloadingLocalModel)}
                >
                  {downloading ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : selectedLocalModel.installed ? (
                    <Check size={16} />
                  ) : (
                    <Download size={16} />
                  )}
                  {downloading
                    ? `Downloading ${localWhisperDownloadProgress ?? 0}%`
                    : selectedLocalModel.installed
                      ? "Use Local Whisper"
                      : "Download and continue"}
                </button>
              </>
            ) : (
              <p className="onboarding-model-empty">
                Local models are loading. Please wait a moment.
              </p>
            )}
            <button
              type="button"
              className="onboarding-secondary"
              onClick={() => onContinueWithoutSetup("local")}
              disabled={Boolean(downloadingLocalModel)}
            >
              Choose a model later
            </button>
            <div className="onboarding-note">
              <ShieldCheck size={15} /> Local Whisper keeps your audio on this
              device and does not need a Groq API key.
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
