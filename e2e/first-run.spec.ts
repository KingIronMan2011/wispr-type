import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const settings = {
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
    };
    let callbacks = 0;
    (
      window as unknown as { __TAURI_INTERNALS__: unknown }
    ).__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" } },
      transformCallback: () => ++callbacks,
      unregisterCallback: () => undefined,
      unregisterListener: () => undefined,
      invoke: async (
        command: string,
        args: { settings?: typeof settings } = {},
      ) => {
        if (command === "get_settings") return settings;
        if (command === "get_history") return [];
        if (command === "has_api_key") return false;
        if (command === "get_microphones")
          return [{ value: "Default microphone", label: "Default microphone" }];
        if (command === "save_settings") return args.settings;
        if (command === "plugin:updater|check") return null;
        return null;
      },
    };
    (
      window as unknown as { __TAURI_EVENT_PLUGIN_INTERNALS__: unknown }
    ).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: () => undefined,
    };
  });
});

test("first-run onboarding can be completed without a key", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("WELCOME TO WISPR TYPE")).toBeVisible();
  await page.getByRole("button", { name: "Set up later" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});
