mod app;
mod audio;
mod commands;
mod models;
mod storage;
mod transcription;

use models::{AppSettings, AppState, Transcript};
use std::{fs, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[tauri::command]
fn get_settings(state: State<AppState>) -> AppSettings {
    commands::get_settings(state)
}
#[tauri::command]
fn get_microphones() -> Result<Vec<audio::AudioDevice>, String> {
    audio::get_microphones()
}
#[tauri::command]
fn start_native_recording(state: State<AppState>) -> Result<(), String> {
    audio::start_native_recording(state)
}
#[tauri::command]
async fn stop_native_recording(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Transcript, String> {
    audio::stop_native_recording(app, state).await
}
#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<AppState>,
    settings: AppSettings,
) -> Result<(), String> {
    commands::save_settings(app, state, settings)
}
#[tauri::command]
fn set_global_shortcut(
    app: AppHandle,
    state: State<AppState>,
    hotkey: String,
) -> Result<AppSettings, String> {
    commands::set_global_shortcut(app, state, hotkey)
}
#[tauri::command]
fn has_api_key() -> bool {
    commands::has_api_key()
}
#[tauri::command]
fn save_api_key(api_key: String) -> Result<(), String> {
    commands::save_api_key(api_key)
}
#[tauri::command]
fn delete_api_key() -> Result<(), String> {
    commands::delete_api_key()
}
#[tauri::command]
fn set_activity_state(app: AppHandle, activity: String) -> Result<(), String> {
    commands::set_activity_state(app, activity)
}
#[tauri::command]
fn get_history(state: State<AppState>) -> Vec<Transcript> {
    commands::get_history(state)
}
#[tauri::command]
fn clear_history(state: State<AppState>) -> Result<(), String> {
    commands::clear_history(state)
}
#[tauri::command]
fn copy_to_clipboard(app: AppHandle, text: String) -> Result<(), String> {
    transcription::copy_to_clipboard(app, text)
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
                .with_handler(|app, _shortcut, event| {
                    let payload = match event.state() {
                        ShortcutState::Pressed => "pressed",
                        ShortcutState::Released => "released",
                    };
                    let _ = app.emit("wispr-shortcut", payload);
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
                recording: Mutex::new(None),
            });
            app::set_up_tray(app.handle())?;
            let mut settings = storage::load_settings(app.state::<AppState>().inner());
            settings.hotkey = settings.hotkey.replace(' ', "");
            if app
                .global_shortcut()
                .register(settings.hotkey.as_str())
                .is_err()
            {
                settings.hotkey = AppSettings::default().hotkey;
                app.global_shortcut().register(settings.hotkey.as_str())?;
            }
            storage::write_json(
                storage::settings_path(app.state::<AppState>().inner()),
                &settings,
            )?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if let Some(state) = window.app_handle().try_state::<AppState>() {
                    if storage::load_settings(&state).keep_running_in_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            get_microphones,
            start_native_recording,
            stop_native_recording,
            save_settings,
            set_global_shortcut,
            has_api_key,
            save_api_key,
            delete_api_key,
            set_activity_state,
            get_history,
            clear_history,
            copy_to_clipboard
        ])
        .run(tauri::generate_context!())
        .expect("error while running Wispr Type");
}
