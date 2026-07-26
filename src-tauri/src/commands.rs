use crate::{
    models::{AppSettings, AppState, Transcript},
    storage::{history_path, load_history, load_settings, secure_entry, settings_path, write_json},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

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
) -> Result<(), String> {
    let existing = load_settings(&state);
    let mut settings = settings;
    settings.hotkey = normalized_hotkey(&settings.hotkey);
    if settings.hotkey != existing.hotkey {
        replace_global_shortcut(&app, &settings.hotkey, &existing.hotkey)?;
    }
    if settings.launch_at_login {
        app.autolaunch().enable().map_err(|err| err.to_string())?;
    } else {
        app.autolaunch().disable().map_err(|err| err.to_string())?;
    }
    write_json(settings_path(&state), &settings)
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
        .and_then(|entry| entry.get_secret().map_err(|err| err.to_string()))
        .is_ok()
}
pub(crate) fn save_api_key(api_key: String) -> Result<(), String> {
    if !api_key.starts_with("gsk_") {
        return Err("That doesn't look like a Groq API key.".into());
    }
    secure_entry()?
        .set_secret(api_key.as_bytes())
        .map_err(|err| err.to_string())
}
pub(crate) fn delete_api_key() -> Result<(), String> {
    secure_entry()?
        .delete_credential()
        .map_err(|err| err.to_string())
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
