mod app;
mod audio;
mod commands;
mod models;
mod overlay;
mod platform;
mod storage;
mod transcription;

use models::{AppSettings, AppState, Transcript};
use std::{
    fs,
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Arc, Mutex,
    },
};
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
fn get_platform_capabilities(state: State<AppState>) -> platform::PlatformCapabilities {
    platform::capabilities(state.global_shortcut_available.load(Ordering::Relaxed))
}
#[tauri::command]
fn start_native_recording(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    match audio::start_native_recording(state) {
        Ok(()) => {
            overlay::show(&app, "listening", "Listening — release to transcribe");
            Ok(())
        }
        Err(error) => {
            overlay::show(&app, "error", &error);
            Err(error)
        }
    }
}
#[tauri::command]
fn start_microphone_check(state: State<AppState>) -> Result<(), String> {
    audio::start_native_recording(state)
}
#[tauri::command]
fn get_recording_status(state: State<AppState>) -> audio::RecordingStatus {
    audio::get_recording_status(state)
}
#[tauri::command]
fn cancel_native_recording(
    app: AppHandle,
    state: State<AppState>,
    reason: Option<String>,
) -> Result<(), String> {
    audio::cancel_native_recording(state)?;
    if let Some(reason) = reason {
        overlay::show(&app, "error", reason);
    } else {
        overlay::hide(&app);
    }
    Ok(())
}
#[tauri::command]
async fn stop_native_recording(
    app: AppHandle,
    state: State<'_, AppState>,
    output_action: Option<String>,
) -> Result<Transcript, String> {
    overlay::show(&app, "transcribing", "Turning speech into text…");
    let result = audio::stop_native_recording(app.clone(), state, output_action).await;
    match &result {
        Ok(_) => {
            overlay::show(&app, "success", "Done — sent to your workspace");
            let _ = app::update_tray_activity(&app, "success");
            log::info!("Dictation completed");
        }
        Err(error) => {
            overlay::show(&app, "error", error);
            let _ = app::update_tray_activity(&app, "error");
            log::warn!("Dictation failed");
        }
    }
    result
}
#[tauri::command]
async fn retry_last_transcription(
    app: AppHandle,
    state: State<'_, AppState>,
    output_action: Option<String>,
) -> Result<Transcript, String> {
    overlay::show(&app, "transcribing", "Retrying your dictation…");
    let result = audio::retry_last_transcription(app.clone(), state, output_action).await;
    match &result {
        Ok(_) => {
            overlay::show(&app, "success", "Done — sent to your workspace");
            let _ = app::update_tray_activity(&app, "success");
            log::info!("Dictation retry completed");
        }
        Err(error) => {
            overlay::show(&app, "error", error);
            let _ = app::update_tray_activity(&app, "error");
            log::warn!("Dictation retry failed");
        }
    }
    result
}
#[tauri::command]
fn has_retryable_dictation(state: State<AppState>) -> bool {
    state
        .last_failed_audio
        .lock()
        .map(|audio| audio.is_some())
        .unwrap_or(false)
}
#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<AppState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
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
async fn test_api_key(api_key: Option<String>) -> commands::ApiKeyTestResult {
    commands::test_api_key(api_key).await
}
#[tauri::command]
fn hide_dictation_overlay(app: AppHandle) {
    overlay::hide(&app);
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
fn update_history_item(
    state: State<AppState>,
    id: String,
    text: String,
) -> Result<Transcript, String> {
    commands::update_history_item(state, id, text)
}
#[tauri::command]
fn set_history_pinned(
    state: State<AppState>,
    id: String,
    pinned: bool,
) -> Result<Vec<Transcript>, String> {
    commands::set_history_pinned(state, id, pinned)
}
#[tauri::command]
fn reset_local_data(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    commands::reset_local_data(app, state)
}
#[tauri::command]
fn copy_to_clipboard(app: AppHandle, text: String) -> Result<(), String> {
    transcription::copy_to_clipboard(app, text)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("wispr-type".into()),
                    },
                ))
                .level(log::LevelFilter::Info)
                .max_file_size(1_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            log::info!("Wispr Type started");
            app.manage(AppState {
                data_dir: state_dir,
                history_lock: Mutex::new(()),
                recording: Mutex::new(None),
                recording_level: Arc::new(AtomicU32::new(0)),
                recording_error: Arc::new(Mutex::new(None)),
                last_failed_audio: Mutex::new(None),
                global_shortcut_available: AtomicBool::new(true),
            });
            app::set_up_tray(app.handle())?;
            overlay::create(app.handle())?;
            let mut settings = storage::load_settings(app.state::<AppState>().inner());
            settings.hotkey = settings.hotkey.replace(' ', "");
            let shortcut_registered = if app
                .global_shortcut()
                .register(settings.hotkey.as_str())
                .is_ok()
            {
                true
            } else {
                settings.hotkey = AppSettings::default().hotkey;
                if app
                    .global_shortcut()
                    .register(settings.hotkey.as_str())
                    .is_err()
                {
                    log::warn!("Global shortcuts are unavailable in this desktop session");
                    false
                } else {
                    true
                }
            };
            app.state::<AppState>()
                .global_shortcut_available
                .store(shortcut_registered, Ordering::Relaxed);
            storage::write_json(
                storage::settings_path(app.state::<AppState>().inner()),
                &settings,
            )?;
            if settings.start_in_tray {
                if let Some(window) = app.get_webview_window("main") {
                    window.hide()?;
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() != "main" {
                    return;
                }
                if let Some(state) = window.app_handle().try_state::<AppState>() {
                    if storage::load_settings(&state).keep_running_in_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        window.app_handle().exit(0);
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            get_microphones,
            get_platform_capabilities,
            start_native_recording,
            start_microphone_check,
            get_recording_status,
            cancel_native_recording,
            stop_native_recording,
            retry_last_transcription,
            has_retryable_dictation,
            save_settings,
            set_global_shortcut,
            has_api_key,
            save_api_key,
            test_api_key,
            hide_dictation_overlay,
            delete_api_key,
            set_activity_state,
            get_history,
            clear_history,
            update_history_item,
            set_history_pinned,
            reset_local_data,
            copy_to_clipboard
        ])
        .run(tauri::generate_context!())
        .expect("error while running Wispr Type");
}
