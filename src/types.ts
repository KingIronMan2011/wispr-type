export type Settings = {
  hotkey: string;
  inputMode: "hold" | "toggle";
  microphone: string;
  model: "whisper-large-v3" | "whisper-large-v3-turbo";
  language: string;
  outputAction: "paste" | "copy";
  keepRunningInTray: boolean;
  launchAtLogin: boolean;
  startInTray: boolean;
  historyRetention: "15" | "30" | "100" | "500" | "never";
  notificationsEnabled: boolean;
  completedOnboarding: boolean;
  voiceCommandsEnabled: boolean;
  textMode: "literal" | "polished";
  personalVocabulary: string;
  dictionaryReplacements: string;
  autoInstallUpdates: boolean;
  deferredUpdateVersion: string;
  transcriptionProvider: "groq" | "local";
  localWhisperModel:
    "tiny" | "base" | "small" | "medium" | "large-v3-turbo" | "large-v3";
  localWhisperAcceleration:
    "auto" | "cpu" | "cuda" | "rocm" | "vulkan" | "metal" | "intel-sycl";
  discordPushToMuteEnabled: boolean;
};

export type Transcript = {
  id: string;
  text: string;
  createdAt: string;
  language: string;
  pinned: boolean;
};

export type RecordingStatus = {
  level: number;
  error: string | null;
};

export type PlatformCapabilities = {
  os: string;
  displayName: string;
  session: string;
  autoPasteSupported: boolean;
  globalShortcutSupported: boolean;
};

export type OverlayPayload = {
  state: "listening" | "transcribing" | "success" | "error";
  message: string;
};

export type ApiKeyTestResult = {
  success: boolean;
  message: string;
};

export type DiscordPushToMuteStatus = {
  supported: boolean;
  configured: boolean;
  message: string;
};

export type LocalWhisperModel = {
  id: Settings["localWhisperModel"];
  name: string;
  description: string;
  downloadSizeMib: number;
  estimatedRamMib: number;
  estimatedVramMib: number;
  requiredFreeDiskMib: number;
  installed: boolean;
};

export type LocalWhisperCapabilities = {
  cpuAvailable: boolean;
  cudaAvailable: boolean;
  rocmAvailable: boolean;
  vulkanAvailable: boolean;
  metalAvailable: boolean;
  intelSyclAvailable: boolean;
  availableMemoryMib: number;
};

export type LocalWhisperDownloadProgress = {
  id: Settings["localWhisperModel"];
  progress: number;
};

export const fallbackSettings: Settings = {
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
  notificationsEnabled: true,
  completedOnboarding: false,
  voiceCommandsEnabled: false,
  textMode: "literal",
  personalVocabulary: "",
  dictionaryReplacements: "",
  autoInstallUpdates: false,
  deferredUpdateVersion: "",
  transcriptionProvider: "groq",
  localWhisperModel: "base",
  localWhisperAcceleration: "auto",
  discordPushToMuteEnabled: false,
};

export const fallbackPlatformCapabilities: PlatformCapabilities = {
  os: "windows",
  displayName: "Windows",
  session: "native",
  autoPasteSupported: true,
  globalShortcutSupported: true,
};

export function displayHotkey(hotkey: string) {
  return hotkey
    .replace(/Key([A-Z])/g, "$1")
    .replace(/Digit(\d)/g, "$1")
    .replaceAll("+", " + ");
}

export function hotkeyFromEvent(event: KeyboardEvent) {
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
  ) {
    return null;
  }
  const modifiers = [
    event.ctrlKey && "Ctrl",
    event.shiftKey && "Shift",
    event.altKey && "Alt",
    event.metaKey && "Super",
  ].filter(Boolean);
  return modifiers.length ? [...modifiers, event.code].join("+") : null;
}
