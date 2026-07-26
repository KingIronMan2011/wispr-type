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
  historyRetention: "15" | "30" | "never";
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

export type OverlayPayload = {
  state: "listening" | "transcribing" | "success" | "error";
  message: string;
};

export type ApiKeyTestResult = {
  success: boolean;
  message: string;
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
