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
    let path = settings_path(state);
    let Ok(raw) = fs::read_to_string(path) else {
        return AppSettings::default();
    };
    let mut settings = serde_json::from_str::<AppSettings>(&raw).unwrap_or_default();
    if serde_json::from_str::<serde_json::Value>(&raw)
        .ok()
        .and_then(|value| value.get("completedOnboarding").cloned())
        .is_none()
    {
        // Existing installations predate the first-run flow and should not be
        // treated as a fresh install after updating.
        settings.completed_onboarding = true;
    }
    settings
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

#[cfg(test)]
mod tests {
    use super::{history_limit, sort_history};
    use crate::models::{AppSettings, Transcript};

    fn transcript(id: &str, created_at: &str, pinned: bool) -> Transcript {
        Transcript {
            id: id.into(),
            text: id.into(),
            created_at: created_at.into(),
            language: "en".into(),
            pinned,
        }
    }

    #[test]
    fn retention_is_bounded_to_supported_values() {
        let mut settings = AppSettings::default();
        settings.history_retention = "30".into();
        assert_eq!(history_limit(&settings), 30);
        settings.history_retention = "never".into();
        assert_eq!(history_limit(&settings), 0);
        settings.history_retention = "unexpected".into();
        assert_eq!(history_limit(&settings), 15);
    }

    #[test]
    fn pinned_transcripts_sort_before_newer_unpinned_items() {
        let mut history = vec![
            transcript("new", "2026-01-03T00:00:00Z", false),
            transcript("pinned", "2026-01-01T00:00:00Z", true),
            transcript("older", "2026-01-02T00:00:00Z", false),
        ];
        sort_history(&mut history);
        assert_eq!(
            history
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["pinned", "new", "older"]
        );
    }
}
