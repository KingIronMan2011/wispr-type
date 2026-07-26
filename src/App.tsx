import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ChevronDown,
  Copy,
  Cpu,
  ExternalLink,
  History,
  Keyboard,
  LoaderCircle,
  LockKeyhole,
  Mic,
  MonitorUp,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Volume2,
} from "lucide-react";
import logo from "./assets/wispr-type-logo.png";

type Settings = {
  hotkey: string;
  inputMode: "hold" | "toggle";
  microphone: string;
  model: "whisper-large-v3" | "whisper-large-v3-turbo";
  language: string;
  outputAction: "paste" | "copy";
  keepRunningInTray: boolean;
  launchAtLogin: boolean;
};

type Transcript = {
  id: string;
  text: string;
  createdAt: string;
  language: string;
};
const fallback: Settings = {
  hotkey: "Ctrl+Shift+Space",
  inputMode: "hold",
  microphone: "Default microphone",
  model: "whisper-large-v3-turbo",
  language: "auto",
  outputAction: "paste",
  keepRunningInTray: true,
  launchAtLogin: false,
};

function displayHotkey(hotkey: string) {
  return hotkey
    .replace(/Key([A-Z])/g, "$1")
    .replace(/Digit(\d)/g, "$1")
    .replaceAll("+", " + ");
}

function hotkeyFromEvent(event: KeyboardEvent) {
  if (
    [
      "ControlLeft",
      "ControlRight",
      "ShiftLeft",
      "ShiftRight",
      "AltLeft",
      "AltRight",
      "MetaLeft",
      "MetaRight",
    ].includes(event.code)
  )
    return null;
  const modifiers = [
    event.ctrlKey && "Ctrl",
    event.shiftKey && "Shift",
    event.altKey && "Alt",
    event.metaKey && "Super",
  ].filter(Boolean);
  return modifiers.length ? [...modifiers, event.code].join("+") : null;
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      aria-label={label}
      className={`toggle ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function Select({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: { value: string; label: string; sub?: string }[];
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="select-wrap">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={15} />
    </label>
  );
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(fallback);
  const [history, setHistory] = useState<Transcript[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const [isDeletingKey, setIsDeletingKey] = useState(false);
  const [microphones, setMicrophones] = useState<
    { value: string; label: string }[]
  >([{ value: "Default microphone", label: "Default microphone" }]);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [message, setMessage] = useState("Ready when you are");
  const recordingRef = useRef(false);

  const refresh = useCallback(async () => {
    const [saved, items, keyStatus] = await Promise.all([
      invoke<Settings>("get_settings"),
      invoke<Transcript[]>("get_history"),
      invoke<boolean>("has_api_key"),
    ]);
    setSettings(saved);
    setHistory(items);
    setHasApiKey(keyStatus);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadMicrophones = useCallback(async () => {
    try {
      setMicrophones(
        await invoke<{ value: string; label: string }[]>("get_microphones"),
      );
    } catch {
      setMessage("Couldn’t read the Windows microphone list");
    }
  }, []);

  useEffect(() => {
    void loadMicrophones();
  }, [loadMicrophones]);

  const persist = useCallback(async (next: Settings) => {
    setSettings(next);
    try {
      await invoke("save_settings", { settings: next });
    } catch {
      setMessage("Couldn’t save that setting");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    setTranscribing(true);
    setMessage("Transcribing your thought…");
    void invoke<Transcript>("stop_native_recording")
      .then((item) => {
        setHistory((items) => [item, ...items].slice(0, 15));
        setMessage(
          settings.outputAction === "paste"
            ? "Pasted into your active app"
            : "Copied to clipboard",
        );
      })
      .catch((error) =>
        setMessage(
          typeof error === "string"
            ? error
            : "Transcription failed. Please try again.",
        ),
      )
      .finally(() => setTranscribing(false));
  }, [settings.outputAction]);

  const startRecording = useCallback(async () => {
    if (recordingRef.current || transcribing) return;
    if (!hasApiKey) {
      setMessage("Add your Groq API key before dictating");
      return;
    }
    try {
      await invoke("start_native_recording");
      recordingRef.current = true;
      setRecording(true);
      setMessage("Listening… release when you’re done");
    } catch (error) {
      setMessage(
        typeof error === "string" ? error : "Couldn’t start the microphone",
      );
    }
  }, [hasApiKey, transcribing]);

  useEffect(() => {
    const unlisten = listen<string>("wispr-shortcut", (event) => {
      if (settings.inputMode === "hold") {
        if (event.payload === "pressed") void startRecording();
        else if (event.payload === "released") stopRecording();
      } else if (event.payload === "pressed") {
        if (recordingRef.current) stopRecording();
        else void startRecording();
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [settings.inputMode, startRecording, stopRecording]);

  useEffect(() => {
    const activity = recording
      ? "recording"
      : transcribing
        ? "transcribing"
        : "ready";
    void invoke("set_activity_state", { activity });
  }, [recording, transcribing]);

  useEffect(() => {
    if (!capturingHotkey) return;
    const capture = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === "Escape") {
        setCapturingHotkey(false);
        setMessage("Shortcut capture cancelled");
        return;
      }
      const hotkey = hotkeyFromEvent(event);
      if (!hotkey) return;
      event.preventDefault();
      void invoke<Settings>("set_global_shortcut", { hotkey })
        .then((next) => {
          setSettings(next);
          setMessage(`${displayHotkey(next.hotkey)} is now active`);
        })
        .catch((error) =>
          setMessage(
            typeof error === "string"
              ? error
              : "Couldn’t register that shortcut",
          ),
        )
        .finally(() => setCapturingHotkey(false));
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [capturingHotkey]);

  const saveKey = async () => {
    if (!apiKey.trim()) return;
    setIsSavingKey(true);
    try {
      await invoke("save_api_key", { apiKey: apiKey.trim() });
      setApiKey("");
      setHasApiKey(true);
      setMessage("Groq API key saved securely");
    } catch {
      setMessage("Couldn’t save the API key");
    } finally {
      setIsSavingKey(false);
    }
  };

  const openGroqKeys = async () => {
    try {
      await openUrl("https://console.groq.com/keys");
    } catch {
      setMessage("Couldn’t open your browser. Visit console.groq.com/keys");
    }
  };

  const removeApiKey = async () => {
    setIsDeletingKey(true);
    try {
      await invoke("delete_api_key");
      setHasApiKey(false);
      setMessage("Groq API key removed from Windows Credential Manager");
    } catch {
      setMessage("Couldn’t remove the API key");
    } finally {
      setIsDeletingKey(false);
    }
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={logo} alt="Wispr Type" />
          <span>
            Wispr <b>Type</b>
          </span>
        </div>
        <nav>
          <a className="active" href="#settings">
            <Settings2 size={17} /> Settings
          </a>
          <a href="#history">
            <History size={17} /> History{" "}
            <span className="nav-count">{history.length}</span>
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy">
            <ShieldCheck size={16} />
            <span>Keys stay on your device</span>
          </div>
          <div className="version">
            WISPR TYPE <span>0.1.0</span>
          </div>
        </div>
      </aside>
      <section className="content" id="settings">
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
                ? "Release to transcribe"
                : settings.inputMode === "hold"
                  ? "Hold anywhere to dictate"
                  : "Press to start or stop dictation"}
            </p>
          </div>
          <div className="audio-bars" aria-hidden="true">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <i key={i} style={{ height: `${12 + ((i * 17) % 35)}px` }} />
            ))}
          </div>
        </section>
        <p className={`notice ${recording || transcribing ? "active" : ""}`}>
          {transcribing && <LoaderCircle size={14} className="spin" />}
          {message}
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
                <p>Works from any app on Windows.</p>
              </div>
              <button
                className="hotkey"
                onClick={() => {
                  setCapturingHotkey(true);
                  setMessage(
                    "Press a shortcut with Ctrl, Shift, Alt, or Super. Esc cancels.",
                  );
                }}
              >
                {capturingHotkey
                  ? "Press shortcut…"
                  : displayHotkey(settings.hotkey)}
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>Interaction</strong>
                <p>Choose how recording begins and ends.</p>
              </div>
              <div className="segmented">
                <button
                  className={settings.inputMode === "hold" ? "selected" : ""}
                  onClick={() =>
                    void persist({ ...settings, inputMode: "hold" })
                  }
                >
                  Hold to talk
                </button>
                <button
                  className={settings.inputMode === "toggle" ? "selected" : ""}
                  onClick={() =>
                    void persist({ ...settings, inputMode: "toggle" })
                  }
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
              <button
                className="panel-action"
                onClick={() => void loadMicrophones()}
              >
                Refresh
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>Microphone</strong>
                <p>Used when dictating.</p>
              </div>
              <Select
                label="Microphone"
                value={settings.microphone}
                onChange={(microphone) =>
                  void persist({ ...settings, microphone })
                }
                options={microphones}
              />
            </div>
            <div className="setting-row">
              <div>
                <strong>Language</strong>
                <p>Whisper detects it automatically.</p>
              </div>
              <Select
                label="Language"
                value={settings.language}
                onChange={(language) => void persist({ ...settings, language })}
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
          <section className="panel">
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
                  void persist({
                    ...settings,
                    model: model as Settings["model"],
                  })
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
                <p>What happens to your text.</p>
              </div>
              <div className="segmented">
                <button
                  className={
                    settings.outputAction === "paste" ? "selected" : ""
                  }
                  onClick={() =>
                    void persist({ ...settings, outputAction: "paste" })
                  }
                >
                  Auto-paste
                </button>
                <button
                  className={settings.outputAction === "copy" ? "selected" : ""}
                  onClick={() =>
                    void persist({ ...settings, outputAction: "copy" })
                  }
                >
                  Copy
                </button>
              </div>
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
              Your API key is encrypted by Windows Credential Manager. It is
              never written to your history or settings file.
            </p>
            <div className="key-input">
              <input
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                type="password"
                placeholder={hasApiKey ? "••••••••••••••••••••" : "gsk_…"}
                aria-label="Groq API key"
              />
              <button
                onClick={() => void saveKey()}
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
                  onClick={() => void removeApiKey()}
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
            <button
              type="button"
              className="inline-link"
              onClick={() => void openGroqKeys()}
            >
              Get a Groq API key <ExternalLink size={13} />
            </button>
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
                  void persist({ ...settings, keepRunningInTray })
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
                  void persist({ ...settings, launchAtLogin })
                }
              />
            </div>
          </section>
        </div>
        <section className="history-section" id="history">
          <div className="history-heading">
            <div>
              <History size={18} />
              <h3>Recent transcripts</h3>
              <span>Last 15</span>
            </div>
            <button
              onClick={() =>
                void invoke("clear_history").then(() => setHistory([]))
              }
            >
              Clear
            </button>
          </div>
          {history.length ? (
            <div className="history-list">
              {history.map((item) => (
                <article key={item.id}>
                  <p>{item.text}</p>
                  <span>
                    {new Date(item.createdAt).toLocaleString()} ·{" "}
                    {item.language || "Auto"}
                  </span>
                  <button
                    onClick={() =>
                      void invoke("copy_to_clipboard", {
                        text: item.text,
                      }).then(() =>
                        setMessage("Transcript copied to clipboard"),
                      )
                    }
                    aria-label="Copy transcript"
                  >
                    <Copy size={15} />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="history-empty">
              <Volume2 size={17} /> Your latest 15 transcripts will appear here.
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
