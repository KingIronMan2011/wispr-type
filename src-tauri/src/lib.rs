use chrono::Utc;
use enigo::{Direction, Enigo, Key, Keyboard, Settings as EnigoSettings};
use keyring::Entry;
use reqwest::multipart::{Form, Part};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const APP_SERVICE: &str = "Wispr Type";
const KEY_ACCOUNT: &str = "groq-api-key";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    hotkey: String,
    input_mode: String,
    microphone: String,
    model: String,
    language: String,
    output_action: String,
    keep_running_in_tray: bool,
    launch_at_login: bool,
}
impl Default for AppSettings {
    fn default() -> Self {
        Self {
            hotkey: "Ctrl + Shift + Space".into(),
            input_mode: "hold".into(),
            microphone: "Default microphone".into(),
            model: "whisper-large-v3-turbo".into(),
            language: "auto".into(),
            output_action: "paste".into(),
            keep_running_in_tray: true,
            launch_at_login: false,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Transcript {
    id: String,
    text: String,
    created_at: String,
    language: String,
}
#[derive(Deserialize)]
struct GroqResponse {
    text: String,
    language: Option<String>,
}
struct AppState {
    data_dir: PathBuf,
    history_lock: Mutex<()>,
}

fn settings_path(state: &AppState) -> PathBuf {
    state.data_dir.join("settings.json")
}
fn history_path(state: &AppState) -> PathBuf {
    state.data_dir.join("history.json")
}
fn read_json<T: for<'a> Deserialize<'a>>(path: PathBuf) -> Option<T> {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
}
fn write_json<T: Serialize>(path: PathBuf, value: &T) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|err| err.to_string())?;
    fs::write(path, bytes).map_err(|err| err.to_string())
}
fn load_settings(state: &AppState) -> AppSettings {
    read_json(settings_path(state)).unwrap_or_default()
}
fn load_history(state: &AppState) -> Vec<Transcript> {
    read_json(history_path(state)).unwrap_or_default()
}
fn secure_entry() -> Result<Entry, String> {
    Entry::new(APP_SERVICE, KEY_ACCOUNT).map_err(|err| err.to_string())
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> AppSettings {
    load_settings(&state)
}
#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<AppState>,
    settings: AppSettings,
) -> Result<(), String> {
    if settings.launch_at_login {
        app.autolaunch().enable().map_err(|err| err.to_string())?;
    } else {
        app.autolaunch().disable().map_err(|err| err.to_string())?;
    }
    write_json(settings_path(&state), &settings)
}
#[tauri::command]
fn has_api_key() -> bool {
    secure_entry()
        .and_then(|entry| entry.get_secret().map_err(|err| err.to_string()))
        .is_ok()
}
#[tauri::command]
fn save_api_key(api_key: String) -> Result<(), String> {
    if !api_key.starts_with("gsk_") {
        return Err("That doesn't look like a Groq API key.".into());
    }
    secure_entry()?
        .set_secret(api_key.as_bytes())
        .map_err(|err| err.to_string())
}
#[tauri::command]
fn get_history(state: State<AppState>) -> Vec<Transcript> {
    let _guard = state.history_lock.lock().expect("history lock poisoned");
    load_history(&state)
}
#[tauri::command]
fn clear_history(state: State<AppState>) -> Result<(), String> {
    let _guard = state
        .history_lock
        .lock()
        .map_err(|_| "History is unavailable".to_string())?;
    write_json(history_path(&state), &Vec::<Transcript>::new())
}

fn paste_text(app: &AppHandle, text: &str, should_paste: bool) -> Result<(), String> {
    app.clipboard()
        .write_text(text)
        .map_err(|err| err.to_string())?;
    if should_paste {
        let mut enigo = Enigo::new(&EnigoSettings::default()).map_err(|err| err.to_string())?;
        enigo
            .key(Key::Control, Direction::Press)
            .map_err(|err| err.to_string())?;
        enigo
            .key(Key::Unicode('v'), Direction::Click)
            .map_err(|err| err.to_string())?;
        enigo
            .key(Key::Control, Direction::Release)
            .map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn transcribe_audio(
    app: AppHandle,
    state: State<'_, AppState>,
    audio: Vec<u8>,
    mime_type: String,
) -> Result<Transcript, String> {
    if audio.is_empty() {
        return Err("No audio was captured.".into());
    }
    let api_key = secure_entry()?
        .get_secret()
        .map_err(|_| "Add a Groq API key in Settings first.".to_string())?;
    let settings = load_settings(&state);
    let part = Part::bytes(audio)
        .file_name("wispr-type-dictation.webm")
        .mime_str(&mime_type)
        .map_err(|err| err.to_string())?;
    let mut form = Form::new()
        .part("file", part)
        .text("model", settings.model.clone())
        .text("response_format", "verbose_json");
    if settings.language != "auto" {
        form = form.text("language", settings.language.clone());
    }
    let response = reqwest::Client::new()
        .post("https://api.groq.com/openai/v1/audio/transcriptions")
        .bearer_auth(String::from_utf8_lossy(&api_key).as_ref())
        .multipart(form)
        .send()
        .await
        .map_err(|err| format!("Groq couldn’t be reached: {err}"))?;
    let status = response.status();
    let body = response.text().await.map_err(|err| err.to_string())?;
    if !status.is_success() {
        return Err(format!("Groq returned {status}: {body}"));
    }
    let result: GroqResponse = serde_json::from_str(&body)
        .map_err(|_| "Groq returned an unexpected transcription response.".to_string())?;
    let text = result.text.trim().to_string();
    if text.is_empty() {
        return Err("No speech was detected.".into());
    }
    paste_text(&app, &text, settings.output_action == "paste")?;
    let item = Transcript {
        id: format!("{}-{}", Utc::now().timestamp_millis(), text.len()),
        text,
        created_at: Utc::now().to_rfc3339(),
        language: result.language.unwrap_or(settings.language),
    };
    let _guard = state
        .history_lock
        .lock()
        .map_err(|_| "History is unavailable".to_string())?;
    let mut history = load_history(&state);
    history.insert(0, item.clone());
    history.truncate(15);
    write_json(history_path(&state), &history)?;
    Ok(item)
}

fn set_up_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Open Wispr Type", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    TrayIconBuilder::with_id("wispr-type-tray")
        .icon(
            app.default_window_icon()
                .expect("missing application icon")
                .clone(),
        )
        .tooltip("Wispr Type — ready to dictate")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    let target =
                        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
                    if shortcut == &target {
                        let payload = match event.state() {
                            ShortcutState::Pressed => "pressed",
                            ShortcutState::Released => "released",
                        };
                        let _ = app.emit("wispr-shortcut", payload);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let state_dir = app
                .path()
                .app_data_dir()
                .expect("missing app data directory");
            fs::create_dir_all(&state_dir)?;
            app.manage(AppState {
                data_dir: state_dir,
                history_lock: Mutex::new(()),
            });
            set_up_tray(app.handle())?;
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
            app.global_shortcut().register(shortcut)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if let Some(state) = window.app_handle().try_state::<AppState>() {
                    if load_settings(&state).keep_running_in_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            has_api_key,
            save_api_key,
            get_history,
            clear_history,
            transcribe_audio
        ])
        .run(tauri::generate_context!())
        .expect("error while running Wispr Type");
}
