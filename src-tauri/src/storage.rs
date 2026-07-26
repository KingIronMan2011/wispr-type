use crate::models::{AppSettings, AppState, Transcript};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

const APP_SERVICE: &str = "Wispr Type";
const KEY_ACCOUNT: &str = "groq-api-key";

pub(crate) fn settings_path(state: &AppState) -> PathBuf {
    state.data_dir.join("settings.json")
}
pub(crate) fn history_path(state: &AppState) -> PathBuf {
    state.data_dir.join("history.json")
}
pub(crate) fn read_json<T: for<'a> Deserialize<'a>>(path: PathBuf) -> Option<T> {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
}
pub(crate) fn write_json<T: Serialize>(path: PathBuf, value: &T) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|err| err.to_string())?;
    fs::write(path, bytes).map_err(|err| err.to_string())
}
pub(crate) fn load_settings(state: &AppState) -> AppSettings {
    read_json(settings_path(state)).unwrap_or_default()
}
pub(crate) fn load_history(state: &AppState) -> Vec<Transcript> {
    read_json(history_path(state)).unwrap_or_default()
}
pub(crate) fn history_limit(settings: &AppSettings) -> usize {
    match settings.history_retention.as_str() {
        "never" => 0,
        "30" => 30,
        _ => 15,
    }
}
pub(crate) fn sort_history(history: &mut [Transcript]) {
    history.sort_by(|left, right| {
        right
            .pinned
            .cmp(&left.pinned)
            .then_with(|| right.created_at.cmp(&left.created_at))
    });
}
pub(crate) fn secure_entry() -> Result<Entry, String> {
    Entry::new(APP_SERVICE, KEY_ACCOUNT).map_err(|err| err.to_string())
}
