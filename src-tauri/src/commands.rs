use crate::{
    app::update_tray_activity,
    models::{AppSettings, AppState, Transcript},
    storage::{
        history_limit, history_path, load_history, load_settings, secure_entry, settings_path,
        sort_history, write_json,
    },
};
use serde::Serialize;
use std::{fs, time::Duration};
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
    if !matches!(settings.history_retention.as_str(), "15" | "30" | "never") {
        settings.history_retention = "15".into();
    }
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
            return Err("Windows could not apply the launch-at-sign-in setting.".into());
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
    write_json(history_path(&state), &history)?;
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
    secure_entry()?
        .set_password(api_key)
        .map_err(|err| format!("Windows Credential Manager could not save the key: {err}"))
}
pub(crate) fn delete_api_key() -> Result<(), String> {
    secure_entry()?
        .delete_credential()
        .map_err(|err| err.to_string())
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
    let label = match activity.as_str() {
        "recording" => "Listening",
        "transcribing" => "Transcribing",
        _ => "Ready",
    };
    if let Some(tray) = app.tray_by_id("wispr-type-tray") {
        tray.set_tooltip(Some(format!("Wispr Type — {label}")))
            .map_err(|err| err.to_string())?;
    }
    update_tray_activity(&app, activity.as_str()).map_err(|err| err.to_string())?;
    if let Some(window) = app.get_webview_window("main") {
        let title = format!("Wispr Type — {label}");
        window.set_title(&title).map_err(|err| err.to_string())?;
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
    write_json(history_path(&state), &Vec::<Transcript>::new())
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
    write_json(history_path(&state), &history)?;
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
    write_json(history_path(&state), &history)?;
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
    let _ = shortcuts.register(AppSettings::default().hotkey.as_str());
    let _ =
        secure_entry().and_then(|entry| entry.delete_credential().map_err(|err| err.to_string()));
    let _ = fs::remove_file(settings_path(&state));
    let _ = fs::remove_file(history_path(&state));
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
