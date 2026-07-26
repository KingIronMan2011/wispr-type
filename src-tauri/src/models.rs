use crate::audio::NativeRecording;
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{atomic::AtomicU32, Arc, Mutex},
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppSettings {
    pub(crate) hotkey: String,
    pub(crate) input_mode: String,
    pub(crate) microphone: String,
    pub(crate) model: String,
    pub(crate) language: String,
    pub(crate) output_action: String,
    pub(crate) keep_running_in_tray: bool,
    pub(crate) launch_at_login: bool,
    pub(crate) start_in_tray: bool,
    #[serde(default = "default_history_retention")]
    pub(crate) history_retention: String,
    #[serde(default = "default_notifications_enabled")]
    pub(crate) notifications_enabled: bool,
    pub(crate) completed_onboarding: bool,
}

fn default_history_retention() -> String {
    "15".into()
}
fn default_notifications_enabled() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            hotkey: "Ctrl+Shift+Space".into(),
            input_mode: "hold".into(),
            microphone: "Default microphone".into(),
            model: "whisper-large-v3-turbo".into(),
            language: "auto".into(),
            output_action: "paste".into(),
            keep_running_in_tray: true,
            launch_at_login: false,
            start_in_tray: false,
            history_retention: default_history_retention(),
            notifications_enabled: true,
            completed_onboarding: false,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Transcript {
    pub(crate) id: String,
    pub(crate) text: String,
    pub(crate) created_at: String,
    pub(crate) language: String,
    #[serde(default)]
    pub(crate) pinned: bool,
}

#[derive(Deserialize)]
pub(crate) struct GroqResponse {
    pub(crate) text: String,
    pub(crate) language: Option<String>,
}

pub(crate) struct AppState {
    pub(crate) data_dir: PathBuf,
    pub(crate) history_lock: Mutex<()>,
    pub(crate) recording: Mutex<Option<NativeRecording>>,
    pub(crate) recording_level: Arc<AtomicU32>,
    pub(crate) recording_error: Arc<Mutex<Option<String>>>,
}
