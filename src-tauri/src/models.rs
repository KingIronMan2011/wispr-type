use crate::audio::NativeRecording;
use crate::transcription::TranscriptionAudio;
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU32},
        Arc, Mutex,
    },
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
    #[serde(default)]
    pub(crate) voice_commands_enabled: bool,
    #[serde(default = "default_text_mode")]
    pub(crate) text_mode: String,
    #[serde(default)]
    pub(crate) personal_vocabulary: String,
    #[serde(default)]
    pub(crate) dictionary_replacements: String,
    #[serde(default)]
    pub(crate) auto_install_updates: bool,
    #[serde(default)]
    pub(crate) deferred_update_version: String,
    #[serde(default = "default_transcription_provider")]
    pub(crate) transcription_provider: String,
    #[serde(default = "default_local_whisper_model")]
    pub(crate) local_whisper_model: String,
    #[serde(default = "default_local_whisper_acceleration")]
    pub(crate) local_whisper_acceleration: String,
    #[serde(default)]
    pub(crate) discord_push_to_mute_enabled: bool,
}

fn default_history_retention() -> String {
    "15".into()
}
fn default_notifications_enabled() -> bool {
    true
}
fn default_text_mode() -> String {
    "literal".into()
}
fn default_transcription_provider() -> String {
    "groq".into()
}
fn default_local_whisper_model() -> String {
    "base".into()
}
fn default_local_whisper_acceleration() -> String {
    "auto".into()
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
            voice_commands_enabled: false,
            text_mode: "literal".into(),
            personal_vocabulary: String::new(),
            dictionary_replacements: String::new(),
            auto_install_updates: false,
            deferred_update_version: String::new(),
            transcription_provider: default_transcription_provider(),
            local_whisper_model: default_local_whisper_model(),
            local_whisper_acceleration: default_local_whisper_acceleration(),
            discord_push_to_mute_enabled: false,
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
    pub(crate) discord_push_to_mute_held: AtomicBool,
    pub(crate) last_failed_audio: Mutex<Option<TranscriptionAudio>>,
    pub(crate) global_shortcut_available: AtomicBool,
}
