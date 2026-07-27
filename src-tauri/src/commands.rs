use crate::{
    app::update_tray_activity,
    models::{AppSettings, AppState, Transcript},
    platform,
    storage::{
        clear_history_db, history_db_path, history_limit, load_history, load_settings,
        local_models_dir, save_history, secure_entry, settings_path, sort_history, write_json,
    },
    transcription::copy_to_clipboard,
};
use serde::Serialize;
use std::{fs, sync::atomic::Ordering, time::Duration};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

const GROQ_MODELS_URL: &str = "https://api.groq.com/openai/v1/models";

fn normalized_hotkey(hotkey: &str) -> String {
    hotkey.replace(' ', "")
}
fn replace_global_shortcut(app: &AppHandle, next: &str, previous: &str) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    shortcuts.unregister_all().map_err(|err| err.to_string())?;
    if let Err(err) = shortcuts.register(next) {
        let _ = shortcuts.register(previous);
        return Err(format!(
            "Couldn’t register {next}. It may already be used by another app: {err}"
        ));
    }
    Ok(())
}

pub(crate) fn get_settings(state: State<AppState>) -> AppSettings {
    load_settings(&state)
}

pub(crate) fn save_settings(
    app: AppHandle,
    state: State<AppState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let existing = load_settings(&state);
    let mut settings = settings;
    settings.hotkey = normalized_hotkey(&settings.hotkey);
    if !matches!(
        settings.history_retention.as_str(),
        "15" | "30" | "100" | "500" | "never"
    ) {
        settings.history_retention = "15".into();
    }
    if !matches!(settings.text_mode.as_str(), "literal" | "polished") {
        settings.text_mode = "literal".into();
    }
    if !matches!(settings.transcription_provider.as_str(), "groq" | "local") {
        settings.transcription_provider = "groq".into();
    }
    if !matches!(
        settings.local_whisper_model.as_str(),
        "tiny" | "base" | "small" | "medium"
    ) {
        settings.local_whisper_model = "base".into();
    }
    if !matches!(
        settings.local_whisper_acceleration.as_str(),
        "auto" | "cpu" | "vulkan"
    ) {
        settings.local_whisper_acceleration = "auto".into();
    }
    settings.personal_vocabulary = settings
        .personal_vocabulary
        .trim()
        .chars()
        .take(650)
        .collect();
    settings.dictionary_replacements = settings
        .dictionary_replacements
        .lines()
        .take(50)
        .collect::<Vec<_>>()
        .join("\n")
        .chars()
        .take(4_000)
        .collect();
    settings.deferred_update_version = settings
        .deferred_update_version
        .trim()
        .chars()
        .take(64)
        .collect();
    if settings.hotkey != existing.hotkey {
        replace_global_shortcut(&app, &settings.hotkey, &existing.hotkey)?;
    }
    if settings.launch_at_login != existing.launch_at_login {
        let autostart = app.autolaunch();
        if settings.launch_at_login {
            autostart.enable().map_err(|err| err.to_string())?;
        } else {
            autostart.disable().map_err(|err| err.to_string())?;
        }
        let registered = autostart.is_enabled().map_err(|err| err.to_string())?;
        if registered != settings.launch_at_login {
            return Err(
                "The operating system could not apply the launch-at-sign-in setting.".into(),
            );
        }
    }
    write_json(settings_path(&state), &settings)?;
    let _guard = state
        .history_lock
        .lock()
        .map_err(|_| "History is unavailable".to_string())?;
    let limit = history_limit(&settings);
    let mut history = if limit == 0 {
        Vec::new()
    } else {
        load_history(&state)
    };
    sort_history(&mut history);
    history.truncate(limit);
    save_history(&state, &history)?;
    log::info!("Settings saved");
    Ok(settings)
}

pub(crate) fn set_global_shortcut(
    app: AppHandle,
    state: State<AppState>,
    hotkey: String,
) -> Result<AppSettings, String> {
    let mut settings = load_settings(&state);
    let next_hotkey = normalized_hotkey(&hotkey);
    replace_global_shortcut(&app, &next_hotkey, &settings.hotkey)?;
    state
        .global_shortcut_available
        .store(true, Ordering::Relaxed);
    settings.hotkey = next_hotkey;
    write_json(settings_path(&state), &settings)?;
    Ok(settings)
}

pub(crate) fn has_api_key() -> bool {
    secure_entry()
        .and_then(|entry| entry.get_password().map_err(|err| err.to_string()))
        .is_ok()
}
pub(crate) fn save_api_key(api_key: String) -> Result<(), String> {
    let api_key = api_key.trim();
    if !api_key.starts_with("gsk_") {
        return Err("That doesn't look like a Groq API key.".into());
    }
    secure_entry()?.set_password(api_key).map_err(|err| {
        format!(
            "{} could not save the key: {err}",
            platform::credential_store_name()
        )
    })
}
pub(crate) fn delete_api_key() -> Result<(), String> {
    secure_entry()?
        .delete_credential()
        .map_err(|err| err.to_string())
}

fn diagnostic_context(context: &str) -> &'static str {
    match context {
        "recording" => "recording",
        "microphone-check" => "microphone check",
        "transcription" => "transcription",
        _ => "general",
    }
}

fn microphone_selection(settings: &AppSettings) -> &'static str {
    if settings.microphone == "Default microphone" {
        "default device"
    } else {
        "specific device (name redacted)"
    }
}

fn diagnostic_model(model: &str) -> &'static str {
    match model {
        "whisper-large-v3" => "whisper-large-v3",
        "whisper-large-v3-turbo" => "whisper-large-v3-turbo",
        _ => "unknown (redacted)",
    }
}

fn diagnostic_language(language: &str) -> &'static str {
    match language {
        "auto" => "auto",
        "en" => "en",
        "de" => "de",
        "es" => "es",
        "fr" => "fr",
        _ => "unknown (redacted)",
    }
}

fn diagnostic_output_action(output_action: &str) -> &'static str {
    match output_action {
        "paste" => "paste",
        "copy" => "copy",
        _ => "unknown (redacted)",
    }
}

pub(crate) fn copy_privacy_safe_diagnostics(
    app: AppHandle,
    state: State<AppState>,
    context: String,
) -> Result<(), String> {
    let settings = load_settings(&state);
    let retry_audio_held = state
        .last_failed_audio
        .lock()
        .map(|audio| audio.is_some())
        .unwrap_or(false);
    let recording_error_available = state
        .recording_error
        .lock()
        .map(|error| error.is_some())
        .unwrap_or(false);
    let diagnostics = format!(
        "Veskri privacy-safe diagnostics\n\
         Generated (UTC): {}\n\
         App version: {}\n\
         Operating system: {}\n\
         Architecture: {}\n\
         Problem area: {}\n\
         API key configured: {}\n\
         Microphone selection: {}\n\
         Transcription model: {}\n\
         Language mode: {}\n\
         Output mode: {}\n\
         Auto-paste supported: {}\n\
         Global shortcut available: {}\n\
         Retry audio held in memory: {}\n\
         Recording error available: {}\n\n\
         Excluded by design: API keys, transcript text, audio, history, microphone names,\n\
         personal dictionary entries, file paths, and application logs.\n",
        chrono::Utc::now().to_rfc3339(),
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH,
        diagnostic_context(&context),
        if has_api_key() { "yes" } else { "no" },
        microphone_selection(&settings),
        diagnostic_model(&settings.model),
        diagnostic_language(&settings.language),
        diagnostic_output_action(&settings.output_action),
        if platform::auto_paste_supported() {
            "yes"
        } else {
            "no"
        },
        if state.global_shortcut_available.load(Ordering::Relaxed) {
            "yes"
        } else {
            "no"
        },
        if retry_audio_held { "yes" } else { "no" },
        if recording_error_available {
            "yes"
        } else {
            "no"
        },
    );
    copy_to_clipboard(app, diagnostics)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApiKeyTestResult {
    success: bool,
    message: String,
}

pub(crate) async fn test_api_key(api_key: Option<String>) -> ApiKeyTestResult {
    let api_key = match api_key.map(|key| key.trim().to_string()) {
        Some(key) if !key.is_empty() => key,
        _ => match secure_entry()
            .and_then(|entry| entry.get_password().map_err(|err| err.to_string()))
        {
            Ok(key) => key,
            Err(_) => {
                return ApiKeyTestResult {
                    success: false,
                    message: "Add a Groq API key before testing the connection.".into(),
                }
            }
        },
    };
    if !api_key.starts_with("gsk_") {
        return ApiKeyTestResult {
            success: false,
            message: "That doesn't look like a Groq API key. It should begin with gsk_.".into(),
        };
    }

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
    {
        Ok(client) => client,
        Err(_) => {
            return ApiKeyTestResult {
                success: false,
                message: "Couldn’t prepare a secure connection to Groq.".into(),
            }
        }
    };
    let response =
        match client
            .get(GROQ_MODELS_URL)
            .bearer_auth(api_key)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) if error.is_timeout() => return ApiKeyTestResult {
                success: false,
                message:
                    "Groq did not respond in time. Check your internet connection and try again."
                        .into(),
            },
            Err(_) => return ApiKeyTestResult {
                success: false,
                message:
                    "Couldn’t reach Groq. Check your internet connection or firewall and try again."
                        .into(),
            },
        };

    let status = response.status();
    let message = match status.as_u16() {
        200 => (true, "Connected to Groq. Your key is ready for dictation."),
        401 => (
            false,
            "Groq rejected this key. Create or copy a fresh key and try again.",
        ),
        403 => (
            false,
            "This key is valid, but its Groq project does not have the required permissions.",
        ),
        429 => (
            false,
            "Groq is reachable, but this project is rate-limited. Try again shortly.",
        ),
        500..=599 => (false, "Groq is temporarily unavailable. Try again shortly."),
        _ => (
            false,
            "Groq could not validate this key. Try again or check your Groq project settings.",
        ),
    };
    ApiKeyTestResult {
        success: message.0,
        message: message.1.into(),
    }
}

pub(crate) fn set_activity_state(app: AppHandle, activity: String) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("veskri-tray") {
        tray.set_tooltip(Some("Veskri"))
            .map_err(|err| err.to_string())?;
    }
    update_tray_activity(&app, activity.as_str()).map_err(|err| err.to_string())?;
    if let Some(window) = app.get_webview_window("main") {
        window.set_title("Veskri").map_err(|err| err.to_string())?;
    }
    Ok(())
}

pub(crate) fn get_history(state: State<AppState>) -> Vec<Transcript> {
    let _guard = state.history_lock.lock().expect("history lock poisoned");
    load_history(&state)
}
pub(crate) fn clear_history(state: State<AppState>) -> Result<(), String> {
    let _guard = state
        .history_lock
        .lock()
        .map_err(|_| "History is unavailable".to_string())?;
    clear_history_db(&state)
}

pub(crate) fn update_history_item(
    state: State<AppState>,
    id: String,
    text: String,
) -> Result<Transcript, String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("A transcript cannot be empty.".into());
    }
    let _guard = state
        .history_lock
        .lock()
        .map_err(|_| "History is unavailable".to_string())?;
    let mut history = load_history(&state);
    let item = history
        .iter_mut()
        .find(|item| item.id == id)
        .ok_or_else(|| "That transcript is no longer available.".to_string())?;
    item.text = text;
    let updated = item.clone();
    save_history(&state, &history)?;
    Ok(updated)
}

pub(crate) fn set_history_pinned(
    state: State<AppState>,
    id: String,
    pinned: bool,
) -> Result<Vec<Transcript>, String> {
    let _guard = state
        .history_lock
        .lock()
        .map_err(|_| "History is unavailable".to_string())?;
    let mut history = load_history(&state);
    let item = history
        .iter_mut()
        .find(|item| item.id == id)
        .ok_or_else(|| "That transcript is no longer available.".to_string())?;
    item.pinned = pinned;
    sort_history(&mut history);
    save_history(&state, &history)?;
    Ok(history)
}

pub(crate) fn reset_local_data(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let _guard = state
        .history_lock
        .lock()
        .map_err(|_| "Local data is unavailable".to_string())?;

    let autostart = app.autolaunch();
    let _ = autostart.disable();
    let shortcuts = app.global_shortcut();
    let _ = shortcuts.unregister_all();
    let shortcut_registered = shortcuts
        .register(AppSettings::default().hotkey.as_str())
        .is_ok();
    state
        .global_shortcut_available
        .store(shortcut_registered, Ordering::Relaxed);
    let _ =
        secure_entry().and_then(|entry| entry.delete_credential().map_err(|err| err.to_string()));
    let _ = fs::remove_file(settings_path(&state));
    let _ = fs::remove_file(history_db_path(&state));
    let _ = fs::remove_file(state.data_dir.join("history.json"));
    let _ = fs::remove_dir_all(local_models_dir(&state.data_dir));
    if let Ok(entries) = fs::read_dir(&state.data_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let is_capture = path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("capture-") && name.ends_with(".wav"));
            if is_capture {
                let _ = fs::remove_file(path);
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        diagnostic_context, diagnostic_language, diagnostic_model, diagnostic_output_action,
        microphone_selection,
    };
    use crate::models::AppSettings;

    #[test]
    fn diagnostics_redact_unexpected_settings_values_and_microphone_names() {
        let mut settings = AppSettings::default();
        settings.microphone = "Julia's private microphone".into();

        assert_eq!(
            microphone_selection(&settings),
            "specific device (name redacted)"
        );
        assert_eq!(
            diagnostic_model("custom personal value"),
            "unknown (redacted)"
        );
        assert_eq!(
            diagnostic_language("custom personal value"),
            "unknown (redacted)"
        );
        assert_eq!(
            diagnostic_output_action("custom personal value"),
            "unknown (redacted)"
        );
    }

    #[test]
    fn diagnostics_accept_only_known_problem_areas() {
        assert_eq!(diagnostic_context("recording"), "recording");
        assert_eq!(diagnostic_context("microphone-check"), "microphone check");
        assert_eq!(diagnostic_context("transcription"), "transcription");
        assert_eq!(diagnostic_context("unexpected private value"), "general");
    }
}
