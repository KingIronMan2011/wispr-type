import {
  KeyRound,
  LoaderCircle,
  Mic,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export default function FirstRunOnboarding({
  apiKey,
  onApiKeyChange,
  onSaveAndContinue,
  onContinueWithoutKey,
  saving,
}: {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  onSaveAndContinue: () => void;
  onContinueWithoutKey: () => void;
  saving: boolean;
}) {
  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <div className="onboarding-mark">
          <Mic size={22} />
        </div>
        <p className="eyebrow">WELCOME TO WISPR TYPE</p>
        <h1>Dictation that stays out of your way.</h1>
        <p className="onboarding-copy">
          Add a Groq API key to start dictating. You can change every preference
          later.
        </p>
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
          className="onboarding-primary"
          onClick={onSaveAndContinue}
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
          className="onboarding-secondary"
          onClick={onContinueWithoutKey}
          disabled={saving}
        >
          Set up later
        </button>
        <div className="onboarding-note">
          <ShieldCheck size={15} /> Your key is stored in secure
          operating-system storage, never in the app settings.
        </div>
      </section>
    </main>
  );
}
