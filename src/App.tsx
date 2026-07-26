import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import {
  ChevronDown,
  Check,
  CircleAlert,
  Copy,
  Cpu,
  Eye,
  EyeOff,
  ExternalLink,
  History,
  Keyboard,
  LoaderCircle,
  LockKeyhole,
  Mic,
  MonitorUp,
  Pencil,
  Pin,
  PinOff,
  Search,
  Settings2,
  Sparkles,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
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
  startInTray: boolean;
  historyRetention: "15" | "30" | "never";
};

type Transcript = {
  id: string;
  text: string;
  createdAt: string;
  language: string;
  pinned: boolean;
};
type RecordingStatus = {
  level: number;
  error: string | null;
};
type OverlayPayload = {
  state: "listening" | "transcribing" | "success" | "error";
  message: string;
};
type ApiKeyTestResult = {
  success: boolean;
  message: string;
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
  startInTray: false,
  historyRetention: "15",
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

function DictationOverlay() {
  const [overlay, setOverlay] = useState<OverlayPayload>({
    state: "listening",
    message: "Listening — release to transcribe",
  });
  const [inputLevel, setInputLevel] = useState(0);

  useEffect(() => {
    document.body.classList.add("overlay-window");
    return () => document.body.classList.remove("overlay-window");
  }, []);

  useEffect(() => {
    const unlisten = listen<OverlayPayload>("wispr-overlay", (event) => {
      setOverlay(event.payload);
      if (event.payload.state !== "listening") setInputLevel(0);
    });
    return () => void unlisten.then((fn) => fn());
  }, []);

  useEffect(() => {
    if (overlay.state !== "listening") return;
    let disposed = false;
    const updateLevel = () => {
      void invoke<RecordingStatus>("get_recording_status")
        .then((status) => {
          if (!disposed) setInputLevel(status.level);
        })
        .catch(() => undefined);
    };
    updateLevel();
    const timer = window.setInterval(updateLevel, 80);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [overlay.state]);

  useEffect(() => {
    if (overlay.state !== "success" && overlay.state !== "error") return;
    const timer = window.setTimeout(() => {
      void invoke("hide_dictation_overlay");
    }, 1_800);
    return () => window.clearTimeout(timer);
  }, [overlay.state]);

  const meterLevel = Math.max(inputLevel / 1000, 0.06);
  const icon =
    overlay.state === "success" ? (
      <Check size={19} />
    ) : overlay.state === "error" ? (
      <CircleAlert size={19} />
    ) : overlay.state === "transcribing" ? (
      <LoaderCircle size={19} className="spin" />
    ) : (
      <Mic size={19} />
    );

  return (
    <main className={`dictation-overlay ${overlay.state}`}>
      <div className="overlay-icon">{icon}</div>
      <div className="overlay-copy">
        <strong>
          {overlay.state === "listening"
            ? "Listening"
            : overlay.state === "transcribing"
              ? "Transcribing"
              : overlay.state === "success"
                ? "Complete"
                : "Needs attention"}
        </strong>
        <span>{overlay.message}</span>
      </div>
      <div className="overlay-meter" aria-hidden="true">
        {[1, 2, 3, 4, 5, 6, 7].map((bar) => (
          <i
            key={bar}
            style={{
              height: `${Math.round(
                6 + meterLevel * (12 + ((bar * 13) % 23)),
              )}px`,
            }}
          />
        ))}
      </div>
    </main>
  );
}

export default function App() {
  if (window.location.hash === "#dictation-overlay") {
    return <DictationOverlay />;
  }
  const [settings, setSettings] = useState<Settings>(fallback);
  const [history, setHistory] = useState<Transcript[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [activeSection, setActiveSection] = useState<"settings" | "history">(
    "settings",
  );
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const [isDeletingKey, setIsDeletingKey] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [microphones, setMicrophones] = useState<
    { value: string; label: string }[]
  >([{ value: "Default microphone", label: "Default microphone" }]);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [keyTest, setKeyTest] = useState<ApiKeyTestResult | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [message, setMessage] = useState("Ready when you are");
  const recordingRef = useRef(false);
  const settingsRef = useRef<Settings>(fallback);

  const refresh = useCallback(async () => {
    const [saved, items, keyStatus] = await Promise.all([
      invoke<Settings>("get_settings"),
      invoke<Transcript[]>("get_history"),
      invoke<boolean>("has_api_key"),
    ]);
    settingsRef.current = saved;
    setSettings(saved);
    setHistory(items);
    setHasApiKey(keyStatus);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sections = ["settings", "history"]
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));
    const observer = new IntersectionObserver(
      (entries) => {
        const current = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) => right.intersectionRatio - left.intersectionRatio,
          )[0];
        if (current) {
          setActiveSection(current.target.id as "settings" | "history");
        }
      },
      { rootMargin: "-12% 0px -58% 0px", threshold: [0.05, 0.25, 0.5] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    const timer = window.setTimeout(() => {
      void check()
        .then((update) => {
          if (!disposed) setAvailableUpdate(update);
        })
        .catch(() => undefined);
    }, 1_500);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, []);

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
    settingsRef.current = next;
    setSettings(next);
    try {
      await invoke("save_settings", { settings: next });
    } catch (error) {
      setMessage(
        typeof error === "string" ? error : "Couldn’t save that setting",
      );
    }
  }, []);

  const cancelRecording = useCallback((reason = "Recording cancelled") => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    setInputLevel(0);
    setMessage(reason);
    void invoke("cancel_native_recording").catch((error) =>
      setMessage(
        typeof error === "string" ? error : "Couldn’t cancel the recording",
      ),
    );
  }, []);

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    setInputLevel(0);
    setTranscribing(true);
    setMessage("Transcribing your thought…");
    void invoke<Transcript>("stop_native_recording", {
      outputAction: settingsRef.current.outputAction,
    })
      .then((item) => {
        void invoke<Transcript[]>("get_history")
          .then(setHistory)
          .catch(() => {
            if (settingsRef.current.historyRetention === "never") {
              setHistory([]);
              return;
            }
            const limit = Number(settingsRef.current.historyRetention);
            setHistory((items) => [item, ...items].slice(0, limit));
          });
        setMessage(
          settingsRef.current.outputAction === "paste"
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
  }, []);

  const startRecording = useCallback(async () => {
    if (recordingRef.current || transcribing) return;
    if (!hasApiKey) {
      setMessage("Add your Groq API key before dictating");
      return;
    }
    try {
      await invoke("start_native_recording");
      recordingRef.current = true;
      setInputLevel(0);
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
    if (!recording) {
      setInputLevel(0);
      return;
    }
    let disposed = false;
    const pollStatus = async () => {
      try {
        const status = await invoke<RecordingStatus>("get_recording_status");
        if (disposed) return;
        setInputLevel(status.level);
        if (status.error) {
          cancelRecording(status.error);
          void loadMicrophones();
        }
      } catch {
        if (!disposed) cancelRecording("Couldn’t read microphone status");
      }
    };
    void pollStatus();
    const timer = window.setInterval(() => void pollStatus(), 80);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [cancelRecording, loadMicrophones, recording]);

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
          settingsRef.current = next;
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

  useEffect(() => {
    if (capturingHotkey) return;
    const cancelWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !recordingRef.current) return;
      event.preventDefault();
      cancelRecording("Recording cancelled");
    };
    window.addEventListener("keydown", cancelWithEscape, true);
    return () => window.removeEventListener("keydown", cancelWithEscape, true);
  }, [cancelRecording, capturingHotkey]);

  const saveKey = async () => {
    if (!apiKey.trim()) return;
    setIsSavingKey(true);
    try {
      await invoke("save_api_key", { apiKey: apiKey.trim() });
      setApiKey("");
      setShowApiKey(false);
      setHasApiKey(true);
      setKeyTest(null);
      setMessage(
        "Groq API key saved securely — test the connection before dictating.",
      );
    } catch (error) {
      const detail =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "";
      setMessage(detail || "Couldn’t save the API key");
    } finally {
      setIsSavingKey(false);
    }
  };

  const testApiKey = async () => {
    setIsTestingKey(true);
    try {
      const result = await invoke<ApiKeyTestResult>("test_api_key", {
        apiKey: apiKey.trim() || null,
      });
      setKeyTest(result);
      setMessage(result.message);
    } catch {
      const result = {
        success: false,
        message: "Couldn’t run the Groq connection test.",
      };
      setKeyTest(result);
      setMessage(result.message);
    } finally {
      setIsTestingKey(false);
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

  const goToSection = (section: "settings" | "history") => {
    setActiveSection(section);
    document.getElementById(section)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const copyTranscript = async (item: Transcript) => {
    try {
      await invoke("copy_to_clipboard", { text: item.text });
      setMessage("Transcript copied to clipboard");
    } catch {
      setMessage("Couldn’t copy that transcript");
    }
  };

  const togglePinned = async (item: Transcript) => {
    try {
      const next = await invoke<Transcript[]>("set_history_pinned", {
        id: item.id,
        pinned: !item.pinned,
      });
      setHistory(next);
      setMessage(item.pinned ? "Transcript unpinned" : "Transcript pinned");
    } catch {
      setMessage("Couldn’t update that transcript");
    }
  };

  const saveHistoryEdit = async () => {
    if (!editingHistoryId || !editingText.trim()) return;
    try {
      const updated = await invoke<Transcript>("update_history_item", {
        id: editingHistoryId,
        text: editingText,
      });
      setHistory((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      setEditingHistoryId(null);
      setEditingText("");
      setMessage("Transcript updated");
    } catch (error) {
      setMessage(
        typeof error === "string" ? error : "Couldn’t update that transcript",
      );
    }
  };

  const clearHistory = async () => {
    if (
      !window.confirm(
        "Clear every transcript in History? This cannot be undone.",
      )
    ) {
      return;
    }
    try {
      await invoke("clear_history");
      setHistory([]);
      setEditingHistoryId(null);
      setMessage("Transcript history cleared");
    } catch {
      setMessage("Couldn’t clear transcript history");
    }
  };

  const resetLocalData = async () => {
    const confirmed = window.confirm(
      "Remove your API key, settings, transcript history, and launch-at-sign-in setting from this device? This cannot be undone.",
    );
    if (!confirmed) return;
    try {
      await invoke("reset_local_data");
      settingsRef.current = fallback;
      setSettings(fallback);
      setHistory([]);
      setHasApiKey(false);
      setApiKey("");
      setKeyTest(null);
      setMessage("All Wispr Type data was removed from this device");
    } catch {
      setMessage("Couldn’t remove all local data");
    }
  };

  const installUpdate = async () => {
    if (!availableUpdate || isInstallingUpdate) return;
    setIsInstallingUpdate(true);
    try {
      await availableUpdate.downloadAndInstall();
      await relaunch();
    } catch {
      setIsInstallingUpdate(false);
      setMessage("Update download failed. Please try again.");
    }
  };

  const meterLevel = recording ? Math.max(inputLevel / 1000, 0.05) : 0.28;
  const filteredHistory = history.filter((item) => {
    const query = historyQuery.trim().toLocaleLowerCase();
    return (
      !query ||
      item.text.toLocaleLowerCase().includes(query) ||
      item.language.toLocaleLowerCase().includes(query)
    );
  });

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
          <a
            className={activeSection === "settings" ? "active" : ""}
            href="#settings"
            onClick={(event) => {
              event.preventDefault();
              goToSection("settings");
            }}
          >
            <Settings2 size={17} /> Settings
          </a>
          <a
            className={activeSection === "history" ? "active" : ""}
            href="#history"
            onClick={(event) => {
              event.preventDefault();
              goToSection("history");
            }}
          >
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
      <section className="content">
        <div className="settings-section" id="settings">
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
                onClick={() => void installUpdate()}
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
              aria-label={
                recording ? "Live microphone level" : "Microphone level"
              }
              role="img"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                <i
                  key={i}
                  style={{
                    height: `${Math.round(
                      5 + meterLevel * (11 + ((i * 17) % 31)),
                    )}px`,
                  }}
                />
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
                    className={
                      settings.inputMode === "toggle" ? "selected" : ""
                    }
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
                  <p>Refresh after connecting or reconnecting a device.</p>
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
                  onChange={(language) =>
                    void persist({ ...settings, language })
                  }
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
                    {
                      value: "whisper-large-v3-turbo",
                      label: "Large v3 Turbo",
                    },
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
                    className={
                      settings.outputAction === "copy" ? "selected" : ""
                    }
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
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      setKeyTest(null);
                    }}
                    type={showApiKey ? "text" : "password"}
                    placeholder={
                      hasApiKey ? "Paste a replacement key" : "gsk_…"
                    }
                    aria-label="Groq API key"
                  />
                  <button
                    type="button"
                    className="reveal-key"
                    onClick={() => setShowApiKey((visible) => !visible)}
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
                  onClick={() => void testApiKey()}
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
              {keyTest ? (
                <p
                  className={`key-test ${keyTest.success ? "success" : "error"}`}
                >
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
                  onClick={() => void openGroqKeys()}
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
              <div className="setting-row">
                <div>
                  <strong>Start in tray</strong>
                  <p>Hide the window when Wispr Type launches.</p>
                </div>
                <Toggle
                  label="Start in tray"
                  checked={settings.startInTray}
                  onChange={(startInTray) =>
                    void persist({ ...settings, startInTray })
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
                    Saved only on this device. Pinned items count toward the
                    limit.
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
                    void persist(next).then(() => {
                      if (historyRetention === "never") setHistory([]);
                    });
                  }}
                  options={[
                    { value: "15", label: "Last 15" },
                    { value: "30", label: "Last 30" },
                    { value: "never", label: "Don’t save" },
                  ]}
                />
              </div>
              <div className="privacy-notes">
                <span>
                  Audio is processed for transcription and is not stored by
                  Wispr Type.
                </span>
                <span>Your API key stays in Windows Credential Manager.</span>
              </div>
              <div className="privacy-reset">
                <div>
                  <strong>Reset local data</strong>
                  <p>
                    Delete the key, settings, history, and launch-at-sign-in
                    setting.
                  </p>
                </div>
                <button onClick={() => void resetLocalData()}>
                  <Trash2 size={14} /> Reset app
                </button>
              </div>
            </section>
          </div>
        </div>
        <section className="history-section" id="history">
          <div className="history-heading">
            <div>
              <History size={18} />
              <h3>Recent transcripts</h3>
              <span>
                {settings.historyRetention === "never"
                  ? "Not saved"
                  : `Last ${settings.historyRetention}`}
              </span>
            </div>
            {history.length > 0 && (
              <button onClick={() => void clearHistory()}>Clear</button>
            )}
          </div>
          <label className="history-search">
            <Search size={14} />
            <span className="sr-only">Search transcript history</span>
            <input
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="Search transcripts"
            />
          </label>
          {history.length ? (
            <div className="history-list">
              {filteredHistory.map((item) => {
                const editing = editingHistoryId === item.id;
                return (
                  <article
                    key={item.id}
                    className={item.pinned ? "pinned" : ""}
                  >
                    {editing ? (
                      <textarea
                        value={editingText}
                        onChange={(event) => setEditingText(event.target.value)}
                        aria-label="Edit transcript"
                        autoFocus
                      />
                    ) : (
                      <p>{item.text}</p>
                    )}
                    <span>
                      {item.pinned && "Pinned · "}
                      {new Date(item.createdAt).toLocaleString()} ·{" "}
                      {item.language || "Auto"}
                    </span>
                    <div className="history-actions">
                      {editing ? (
                        <>
                          <button onClick={() => void saveHistoryEdit()}>
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingHistoryId(null);
                              setEditingText("");
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => void togglePinned(item)}
                            aria-label={
                              item.pinned
                                ? "Unpin transcript"
                                : "Pin transcript"
                            }
                            title={item.pinned ? "Unpin" : "Pin"}
                          >
                            {item.pinned ? (
                              <PinOff size={14} />
                            ) : (
                              <Pin size={14} />
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setEditingHistoryId(item.id);
                              setEditingText(item.text);
                            }}
                            aria-label="Edit transcript"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => void copyTranscript(item)}
                            aria-label="Copy transcript"
                            title="Copy"
                          >
                            <Copy size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : settings.historyRetention === "never" ? (
            <div className="history-empty">
              <ShieldCheck size={17} /> Transcript saving is turned off.
            </div>
          ) : (
            <div className="history-empty">
              <Volume2 size={17} /> Your latest transcripts will appear here.
            </div>
          )}
          {history.length > 0 && filteredHistory.length === 0 && (
            <div className="history-empty">
              No transcripts match that search.
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
