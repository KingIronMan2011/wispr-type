import { describe, expect, it } from "vitest";
import { displayHotkey, fallbackSettings } from "./types";

describe("settings defaults", () => {
  it("keeps a safe first-run state", () => {
    expect(fallbackSettings.completedOnboarding).toBe(false);
    expect(fallbackSettings.notificationsEnabled).toBe(true);
    expect(fallbackSettings.dictionaryReplacements).toBe("");
    expect(fallbackSettings.aiPostProcessingEnabled).toBe(false);
    expect(fallbackSettings.aiPostProcessingInstructions).toBe("");
    expect(fallbackSettings.autoInstallUpdates).toBe(false);
    expect(fallbackSettings.deferredUpdateVersion).toBe("");
  });

  it("formats Tauri shortcut codes for people", () => {
    expect(displayHotkey("Ctrl+Shift+KeyD")).toBe("Ctrl + Shift + D");
    expect(displayHotkey("Alt+Digit1")).toBe("Alt + 1");
  });
});
