import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import FirstRunOnboarding from "./components/FirstRunOnboarding";
import Sidebar from "./components/Sidebar";
import {
  fallbackSettings,
  fallbackPlatformCapabilities,
  hotkeyFromEvent,
  type ApiKeyTestResult,
  type LocalWhisperCapabilities,
  type LocalWhisperDownloadProgress,
  type LocalWhisperModel,
  type RecordingStatus,
  type PlatformCapabilities,
  type Settings,
  type Transcript,
} from "./types";

const DictationOverlay = lazy(() => import("./components/DictationOverlay"));
const HistorySection = lazy(() => import("./components/HistorySection"));
const SettingsContent = lazy(() => import("./components/SettingsContent"));

type DiagnosticsContext =
  "general" | "recording" | "microphone-check" | "transcription";

const fallbackLocalWhisperCapabilities: LocalWhisperCapabilities = {
  cpuAvailable: true,
  vulkanAvailable: false,
  availableMemoryMib: 0,
};

export default function App() {
  if (window.location.hash === "#dictation-overlay") {
    return (
      <Suspense fallback={null}>
        <DictationOverlay />
      </Suspense>
    );
  }

  const [settings, setSettings] = useState<Settings>(fallbackSettings);
  const [history, setHistory] = useState<Transcript[]>([]);
  const [activeSection, setActiveSection] = useState<"settings" | "history">(
    "settings",
  );
  const [settingsSection, setSettingsSection] = useState<HTMLDivElement | null>(
    null,
  );
  const [historySection, setHistorySection] = useState<HTMLElement | null>(
    null,
  );
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const [isDeletingKey, setIsDeletingKey] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [keyTest, setKeyTest] = useState<ApiKeyTestResult | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [updateCheckMessage, setUpdateCheckMessage] = useState<string | null>(
    null,
  );
  const [microphones, setMicrophones] = useState<
    { value: string; label: string }[]
  >([{ value: "Default microphone", label: "Default microphone" }]);
  const [platformCapabilities, setPlatformCapabilities] =
    useState<PlatformCapabilities>(fallbackPlatformCapabilities);
  const [localWhisperModels, setLocalWhisperModels] = useState<
    LocalWhisperModel[]
  >([]);
  const [localWhisperCapabilities, setLocalWhisperCapabilities] =
    useState<LocalWhisperCapabilities>(fallbackLocalWhisperCapabilities);
  const [localWhisperDownload, setLocalWhisperDownload] =
    useState<LocalWhisperDownloadProgress | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [message, setMessage] = useState("Ready when you are");
  const [canRetry, setCanRetry] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isCheckingMicrophone, setIsCheckingMicrophone] = useState(false);
  const [microphoneCheckResult, setMicrophoneCheckResult] = useState<
    string | null
  >(null);
  const [diagnosticsContext, setDiagnosticsContext] =
    useState<DiagnosticsContext>("general");
  const [bootstrapped, setBootstrapped] = useState(false);
  const recordingRef = useRef(false);
  const settingsRef = useRef<Settings>(fallbackSettings);
  const settingsSaveVersion = useRef(0);
  const updateCheckInProgress = useRef(false);

  const installUpdatePackage = useCallback(
    async (update: Update, automatic = false) => {
      setIsInstallingUpdate(true);
      setUpdateCheckMessage(
        automatic
          ? `Automatically downloading version ${update.version}…`
          : `Downloading version ${update.version}…`,
      );
      try {
        await update.downloadAndInstall();
        setUpdateCheckMessage("Restarting to finish the update…");
        await relaunch();
        return true;
      } catch {
        setIsInstallingUpdate(false);
        const failure = automatic
          ? "Automatic update failed. You can install it manually."
          : "Update download failed. Please try again.";
        setUpdateCheckMessage(failure);
        setMessage(failure);
        return false;
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    const [
      saved,
      items,
      keyStatus,
      capabilities,
      localModels,
      localCapabilities,
    ] = await Promise.all([
      invoke<Settings>("get_settings"),
      invoke<Transcript[]>("get_history"),
      invoke<boolean>("has_api_key"),
      invoke<PlatformCapabilities | null>("get_platform_capabilities").catch(
        () => null,
      ),
      invoke<LocalWhisperModel[]>("get_local_whisper_models")
        .then((models) => (Array.isArray(models) ? models : []))
        .catch(() => []),
      invoke<LocalWhisperCapabilities>("get_local_whisper_capabilities")
        .then(
          (capabilities) => capabilities ?? fallbackLocalWhisperCapabilities,
        )
        .catch(() => fallbackLocalWhisperCapabilities),
    ]);
    settingsRef.current = saved;
    setSettings(saved);
    setHistory(items);
    setHasApiKey(keyStatus);
    setPlatformCapabilities(capabilities ?? fallbackPlatformCapabilities);
    setLocalWhisperModels(localModels);
    setLocalWhisperCapabilities(localCapabilities);
    setBootstrapped(true);
  }, []);

  const refreshLocalWhisperModels = useCallback(async () => {
    const models = await invoke<LocalWhisperModel[]>(
      "get_local_whisper_models",
    );
    setLocalWhisperModels(Array.isArray(models) ? models : []);
  }, []);

  const downloadLocalWhisperModel = useCallback(
    async (id: string) => {
      setLocalWhisperDownload({
        id: id as Settings["localWhisperModel"],
        progress: 0,
      });
      try {
        await invoke("download_local_whisper_model", { id });
        await refreshLocalWhisperModels();
        setMessage("Local Whisper model is ready for offline dictation.");
      } catch (error) {
        setMessage(
          typeof error === "string"
            ? error
            : "Couldn’t download the local Whisper model.",
        );
      } finally {
        setLocalWhisperDownload(null);
      }
    },
    [refreshLocalWhisperModels],
  );

  const deleteLocalWhisperModel = useCallback(
    async (id: string) => {
      try {
        await invoke("delete_local_whisper_model", { id });
        await refreshLocalWhisperModels();
      } catch (error) {
        setMessage(
          typeof error === "string"
            ? error
            : "Couldn’t delete the local Whisper model.",
        );
      }
    },
    [refreshLocalWhisperModels],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unlisten = listen<LocalWhisperDownloadProgress>(
      "local-whisper-download-progress",
      ({ payload }) => setLocalWhisperDownload(payload),
    );
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);

  useEffect(() => {
    const sections = [settingsSection, historySection].filter(
      (section): section is HTMLElement => Boolean(section),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const current = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) => right.intersectionRatio - left.intersectionRatio,
          )[0];
        if (current)
          setActiveSection(current.target.id as "settings" | "history");
      },
      { rootMargin: "-12% 0px -58% 0px", threshold: [0.05, 0.25, 0.5] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [historySection, settingsSection]);

  const checkForUpdates = useCallback(
    async (silent = false, startup = false) => {
      if (updateCheckInProgress.current) return;
      updateCheckInProgress.current = true;
      setIsCheckingForUpdates(true);
      if (!silent) setUpdateCheckMessage("Checking for updates…");
      try {
        const update = await check();
        setAvailableUpdate(update);
        const isDeferred =
          update?.version === settingsRef.current.deferredUpdateVersion;
        if (
          update &&
          startup &&
          settingsRef.current.autoInstallUpdates &&
          !isDeferred
        ) {
          await installUpdatePackage(update, true);
          return;
        }
        if (!silent) {
          setUpdateCheckMessage(
            update
              ? isDeferred
                ? `Version ${update.version} is ready when you are.`
                : `Version ${update.version} is ready to install.`
              : "Veskri is up to date.",
          );
        }
      } catch {
        if (!silent) {
          setUpdateCheckMessage(
            "Couldn’t check for updates. Check your connection and try again.",
          );
        }
      } finally {
        updateCheckInProgress.current = false;
        setIsCheckingForUpdates(false);
      }
    },
    [installUpdatePackage],
  );

  useEffect(() => {
    let disposed = false;
    if (!bootstrapped) return;
    const timer = window.setTimeout(() => {
      if (!disposed) void checkForUpdates(true, true);
    }, 1_500);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [bootstrapped, checkForUpdates]);

  const loadMicrophones = useCallback(async () => {
    try {
      setMicrophones(
        await invoke<{ value: string; label: string }[]>("get_microphones"),
      );
    } catch {
      setMessage("Couldn’t read the system microphone list");
    }
  }, []);
  useEffect(() => {
    void loadMicrophones();
  }, [loadMicrophones]);

  const persist = useCallback(async (next: Settings) => {
    const previous = settingsRef.current;
    const version = ++settingsSaveVersion.current;
    settingsRef.current = next;
    setSettings(next);
    try {
      const saved = await invoke<Settings>("save_settings", { settings: next });
      if (version === settingsSaveVersion.current) {
        settingsRef.current = saved;
        setSettings(saved);
      }
      return true;
    } catch (error) {
      if (version === settingsSaveVersion.current) {
        settingsRef.current = previous;
        setSettings(previous);
      }
      setMessage(
        typeof error === "string" ? error : "Couldn’t save that setting",
      );
      return false;
    }
  }, []);

  const deferUpdate = useCallback(async () => {
    if (!availableUpdate || isInstallingUpdate) return;
    const saved = await persist({
      ...settingsRef.current,
      deferredUpdateVersion: availableUpdate.version,
    });
    if (saved) {
      setUpdateCheckMessage(
        `Version ${availableUpdate.version} will stay ready until you install it.`,
      );
    }
  }, [availableUpdate, isInstallingUpdate, persist]);

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

  const handleTranscriptSuccess = useCallback(
    (item: Transcript, outputAction: Settings["outputAction"]) => {
      setCanRetry(false);
      void invoke<Transcript[]>("get_history")
        .then(setHistory)
        .catch(() => {
          if (settingsRef.current.historyRetention === "never") setHistory([]);
          else
            setHistory((items) =>
              [item, ...items].slice(
                0,
                Number(settingsRef.current.historyRetention),
              ),
            );
        });
      setMessage(
        outputAction === "paste"
          ? "Pasted into your active app"
          : platformCapabilities.autoPasteSupported
            ? "Copied to clipboard"
            : "Copied to clipboard — auto-paste isn’t available in this Wayland session.",
      );
      void (async () => {
        if (!settingsRef.current.notificationsEnabled) return;
        try {
          let granted = await isPermissionGranted();
          if (!granted) granted = (await requestPermission()) === "granted";
          if (granted) {
            sendNotification({
              title: "Veskri",
              body: "Dictation is ready.",
            });
          }
        } catch {
          // Notification permissions must never interrupt dictation.
        }
      })();
    },
    [platformCapabilities.autoPasteSupported],
  );

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    setInputLevel(0);
    setTranscribing(true);
    setMessage("Transcribing your thought…");
    const outputAction =
      settingsRef.current.outputAction === "paste" &&
      !platformCapabilities.autoPasteSupported
        ? "copy"
        : settingsRef.current.outputAction;
    void invoke<Transcript>("stop_native_recording", {
      outputAction,
    })
      .then((item) => handleTranscriptSuccess(item, outputAction))
      .catch((error) => {
        setDiagnosticsContext("transcription");
        setMessage(
          typeof error === "string"
            ? error
            : "Transcription failed. Please try again.",
        );
        void invoke<boolean>("has_retryable_dictation")
          .then(setCanRetry)
          .catch(() => setCanRetry(false));
      })
      .finally(() => setTranscribing(false));
  }, [handleTranscriptSuccess, platformCapabilities.autoPasteSupported]);

  const retryLastTranscription = useCallback(() => {
    if (isRetrying || recordingRef.current || transcribing) return;
    setIsRetrying(true);
    setTranscribing(true);
    setMessage("Retrying your dictation…");
    const outputAction =
      settingsRef.current.outputAction === "paste" &&
      !platformCapabilities.autoPasteSupported
        ? "copy"
        : settingsRef.current.outputAction;
    void invoke<Transcript>("retry_last_transcription", {
      outputAction,
    })
      .then((item) => handleTranscriptSuccess(item, outputAction))
      .catch((error) => {
        setDiagnosticsContext("transcription");
        setMessage(
          typeof error === "string"
            ? error
            : "Retry failed. Check your connection and try again.",
        );
      })
      .finally(() => {
        setIsRetrying(false);
        setTranscribing(false);
      });
  }, [
    handleTranscriptSuccess,
    isRetrying,
    platformCapabilities.autoPasteSupported,
    transcribing,
  ]);

  const startRecording = useCallback(async () => {
    if (recordingRef.current || transcribing || isCheckingMicrophone) return;
    if (settingsRef.current.transcriptionProvider === "groq" && !hasApiKey) {
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
      setDiagnosticsContext("recording");
      setMessage(
        typeof error === "string" ? error : "Couldn’t start the microphone",
      );
    }
  }, [hasApiKey, isCheckingMicrophone, transcribing]);

  const runMicrophoneCheck = useCallback(async () => {
    if (recordingRef.current || transcribing || isCheckingMicrophone) return;
    setIsCheckingMicrophone(true);
    setMicrophoneCheckResult(null);
    setMessage("Listening to your microphone for two seconds…");
    let highestLevel = 0;
    try {
      await invoke("start_microphone_check");
      for (let index = 0; index < 20; index += 1) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
        const status = await invoke<RecordingStatus>("get_recording_status");
        if (status.error) throw new Error(status.error);
        highestLevel = Math.max(highestLevel, status.level);
      }
      await invoke("cancel_native_recording");
      const result =
        highestLevel >= 20
          ? "Microphone detected your voice. It is ready to dictate."
          : "No speech level was detected. Check the selected microphone and system privacy settings.";
      setMicrophoneCheckResult(result);
      setMessage(result);
    } catch (error) {
      setDiagnosticsContext("microphone-check");
      await invoke("cancel_native_recording").catch(() => undefined);
      const result =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Couldn’t test the microphone.";
      setMicrophoneCheckResult(result);
      setMessage(result);
    } finally {
      setIsCheckingMicrophone(false);
    }
  }, [isCheckingMicrophone, transcribing]);

  useEffect(() => {
    const unlisten = listen<string>("veskri-shortcut", (event) => {
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
    const poll = async () => {
      try {
        const status = await invoke<RecordingStatus>("get_recording_status");
        if (disposed) return;
        setInputLevel(status.level);
        if (status.error) {
          setDiagnosticsContext("recording");
          cancelRecording(status.error);
          void loadMicrophones();
        }
      } catch {
        if (!disposed) cancelRecording("Couldn’t read microphone status");
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 80);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [cancelRecording, loadMicrophones, recording]);

  useEffect(() => {
    void invoke("set_activity_state", {
      activity: recording
        ? "recording"
        : transcribing
          ? "transcribing"
          : "ready",
    });
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
          setMessage(`${next.hotkey.replaceAll("+", " + ")} is now active`);
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
      if (event.key === "Escape" && recordingRef.current) {
        event.preventDefault();
        cancelRecording("Recording cancelled");
      }
    };
    window.addEventListener("keydown", cancelWithEscape, true);
    return () => window.removeEventListener("keydown", cancelWithEscape, true);
  }, [cancelRecording, capturingHotkey]);

  const saveKey = async () => {
    if (!apiKey.trim()) return false;
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
      return true;
    } catch (error) {
      setMessage(
        typeof error === "string" ? error : "Couldn’t save the API key",
      );
      return false;
    } finally {
      setIsSavingKey(false);
    }
  };
  const completeOnboarding = async (saveKeyFirst: boolean) => {
    if (saveKeyFirst && !(await saveKey())) return;
    await persist({ ...settingsRef.current, completedOnboarding: true });
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
  const removeApiKey = async () => {
    setIsDeletingKey(true);
    try {
      await invoke("delete_api_key");
      setHasApiKey(false);
      setMessage("Groq API key removed from secure system storage");
    } catch {
      setMessage("Couldn’t remove the API key");
    } finally {
      setIsDeletingKey(false);
    }
  };
  const installUpdate = async () => {
    if (!availableUpdate || isInstallingUpdate) return;
    await installUpdatePackage(availableUpdate);
  };
  const copyTranscript = async (item: Transcript) => {
    try {
      await invoke("copy_to_clipboard", { text: item.text });
      setMessage("Transcript copied to clipboard");
    } catch {
      setMessage("Couldn’t copy that transcript");
    }
  };
  const copyDiagnostics = async () => {
    try {
      await invoke("copy_privacy_safe_diagnostics", {
        context: diagnosticsContext,
      });
      setMessage("Privacy-safe diagnostics copied to clipboard");
    } catch {
      setMessage("Couldn’t copy diagnostics");
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
  const saveHistoryEdit = async (id: string, text: string) => {
    try {
      const updated = await invoke<Transcript>("update_history_item", {
        id,
        text,
      });
      setHistory((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMessage("Transcript updated");
      return true;
    } catch (error) {
      setMessage(
        typeof error === "string" ? error : "Couldn’t update that transcript",
      );
      return false;
    }
  };
  const clearHistory = async () => {
    if (
      !window.confirm(
        "Clear every transcript in History? This cannot be undone.",
      )
    )
      return;
    try {
      await invoke("clear_history");
      setHistory([]);
      setMessage("Transcript history cleared");
    } catch {
      setMessage("Couldn’t clear transcript history");
    }
  };
  const resetLocalData = async () => {
    if (
      !window.confirm(
        "Remove your API key, settings, transcript history, and launch-at-sign-in setting from this device? This cannot be undone.",
      )
    )
      return;
    try {
      await invoke("reset_local_data");
      settingsRef.current = fallbackSettings;
      setSettings(fallbackSettings);
      setHistory([]);
      setHasApiKey(false);
      setApiKey("");
      setKeyTest(null);
      setMessage("All Veskri data was removed from this device");
    } catch {
      setMessage("Couldn’t remove all local data");
    }
  };
  const goToSection = (section: "settings" | "history") => {
    setActiveSection(section);
    document
      .getElementById(section)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!bootstrapped) return null;
  if (!settings.completedOnboarding) {
    return (
      <>
        <FirstRunOnboarding
          apiKey={apiKey}
          onApiKeyChange={setApiKey}
          onSaveAndContinue={() => void completeOnboarding(true)}
          onContinueWithoutKey={() => void completeOnboarding(false)}
          saving={isSavingKey}
        />
      </>
    );
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to settings
      </a>
      <Sidebar
        activeSection={activeSection}
        historyCount={history.length}
        onNavigate={goToSection}
      />
      <section id="main-content" className="content" tabIndex={-1}>
        <Suspense fallback={null}>
          <SettingsContent
            settings={settings}
            recording={recording}
            transcribing={transcribing}
            inputLevel={inputLevel}
            message={message}
            platformCapabilities={platformCapabilities}
            localWhisperModels={localWhisperModels}
            localWhisperCapabilities={localWhisperCapabilities}
            downloadingLocalModel={localWhisperDownload?.id ?? null}
            localWhisperDownloadProgress={
              localWhisperDownload?.progress ?? null
            }
            onDownloadLocalWhisperModel={(id) =>
              void downloadLocalWhisperModel(id)
            }
            onDeleteLocalWhisperModel={(id) => void deleteLocalWhisperModel(id)}
            canRetry={canRetry}
            isRetrying={isRetrying}
            isCheckingMicrophone={isCheckingMicrophone}
            microphoneCheckResult={microphoneCheckResult}
            capturingHotkey={capturingHotkey}
            microphones={microphones}
            onPersist={persist}
            onCaptureHotkey={() => {
              setCapturingHotkey(true);
              setMessage(
                "Press a shortcut with Ctrl, Shift, Alt, or Super. Esc cancels.",
              );
            }}
            onRefreshMicrophones={() => void loadMicrophones()}
            onRunMicrophoneCheck={() => void runMicrophoneCheck()}
            onRetry={retryLastTranscription}
            apiKey={apiKey}
            onApiKeyChange={(key) => {
              setApiKey(key);
              setKeyTest(null);
            }}
            showApiKey={showApiKey}
            onToggleApiKeyVisibility={() =>
              setShowApiKey((visible) => !visible)
            }
            hasApiKey={hasApiKey}
            isSavingKey={isSavingKey}
            isTestingKey={isTestingKey}
            isDeletingKey={isDeletingKey}
            keyTest={keyTest}
            onSaveKey={() => void saveKey()}
            onTestKey={() => void testApiKey()}
            onRemoveKey={() => void removeApiKey()}
            onOpenGroqKeys={() =>
              void openUrl("https://console.groq.com/keys").catch(() =>
                setMessage(
                  "Couldn’t open your browser. Visit console.groq.com/keys",
                ),
              )
            }
            onOpenPrivacyInfo={() =>
              void openUrl("https://console.groq.com/docs/your-data").catch(
                () =>
                  setMessage(
                    "Couldn’t open your browser. Visit console.groq.com/docs/your-data",
                  ),
              )
            }
            onCopyDiagnostics={() => void copyDiagnostics()}
            availableUpdate={availableUpdate}
            updateDeferred={
              settings.deferredUpdateVersion === availableUpdate?.version
            }
            isCheckingForUpdates={isCheckingForUpdates}
            isInstallingUpdate={isInstallingUpdate}
            updateCheckMessage={updateCheckMessage}
            onCheckForUpdates={() => void checkForUpdates()}
            onInstallUpdate={() => void installUpdate()}
            onDeferUpdate={() => void deferUpdate()}
            onResetLocalData={() => void resetLocalData()}
            onHistoryDisabled={() => setHistory([])}
            settingsSectionRef={setSettingsSection}
          />
          <HistorySection
            history={history}
            settings={settings}
            onClear={() => void clearHistory()}
            onCopy={(item) => void copyTranscript(item)}
            onPin={(item) => void togglePinned(item)}
            onEdit={saveHistoryEdit}
            historySectionRef={setHistorySection}
          />
        </Suspense>
      </section>
    </main>
  );
}
