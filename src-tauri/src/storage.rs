use crate::models::{AppSettings, AppState, Transcript};
use keyring::Entry;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

const APP_SERVICE: &str = "Veskri";
const LEGACY_APP_SERVICE: &str = "Wispr Type";
const LEGACY_DATA_DIRECTORY: &str = "com.wisprtype.desktop";
const KEY_ACCOUNT: &str = "groq-api-key";

pub(crate) fn settings_path(state: &AppState) -> PathBuf {
    state.data_dir.join("settings.json")
}
pub(crate) fn history_path(state: &AppState) -> PathBuf {
    state.data_dir.join("history.json")
}
pub(crate) fn history_db_path(state: &AppState) -> PathBuf {
    state.data_dir.join("history.db")
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
    let Ok(connection) = history_connection(state) else {
        return Vec::new();
    };
    let Ok(mut statement) = connection.prepare(
        "SELECT id, text, created_at, language, pinned FROM transcripts ORDER BY pinned DESC, created_at DESC",
    ) else {
        return Vec::new();
    };
    statement
        .query_map([], |row| {
            Ok(Transcript {
                id: row.get(0)?,
                text: row.get(1)?,
                created_at: row.get(2)?,
                language: row.get(3)?,
                pinned: row.get::<_, i64>(4)? != 0,
            })
        })
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .collect()
}
pub(crate) fn save_history(state: &AppState, history: &[Transcript]) -> Result<(), String> {
    let mut connection = history_connection(state)?;
    let transaction = connection.transaction().map_err(|err| err.to_string())?;
    transaction
        .execute("DELETE FROM transcripts", [])
        .map_err(|err| err.to_string())?;
    {
        let mut insert = transaction
            .prepare("INSERT INTO transcripts (id, text, created_at, language, pinned) VALUES (?1, ?2, ?3, ?4, ?5)")
            .map_err(|err| err.to_string())?;
        for item in history {
            insert
                .execute(params![
                    item.id,
                    item.text,
                    item.created_at,
                    item.language,
                    item.pinned as i64
                ])
                .map_err(|err| err.to_string())?;
        }
    }
    transaction.commit().map_err(|err| err.to_string())
}
pub(crate) fn clear_history_db(state: &AppState) -> Result<(), String> {
    let connection = history_connection(state)?;
    connection
        .execute("DELETE FROM transcripts", [])
        .map_err(|err| err.to_string())?;
    Ok(())
}
fn history_connection(state: &AppState) -> Result<Connection, String> {
    let connection = Connection::open(history_db_path(state)).map_err(|err| err.to_string())?;
    connection
        .execute_batch("CREATE TABLE IF NOT EXISTS transcripts (id TEXT PRIMARY KEY, text TEXT NOT NULL, created_at TEXT NOT NULL, language TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0)")
        .map_err(|err| err.to_string())?;
    let count: i64 = connection
        .query_row("SELECT COUNT(*) FROM transcripts", [], |row| row.get(0))
        .map_err(|err| err.to_string())?;
    if count == 0 {
        if let Some(legacy) = read_json::<Vec<Transcript>>(history_path(state)) {
            for item in legacy {
                connection.execute(
                    "INSERT OR IGNORE INTO transcripts (id, text, created_at, language, pinned) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![item.id, item.text, item.created_at, item.language, item.pinned as i64],
                ).map_err(|err| err.to_string())?;
            }
            let _ = fs::remove_file(history_path(state));
        }
    }
    Ok(connection)
}
pub(crate) fn history_limit(settings: &AppSettings) -> usize {
    match settings.history_retention.as_str() {
        "never" => 0,
        "100" => 100,
        "500" => 500,
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

pub(crate) fn migrate_legacy_installation(data_dir: &Path) -> Result<(), String> {
    let Some(parent) = data_dir.parent() else {
        return Ok(());
    };
    let legacy_dir = parent.join(LEGACY_DATA_DIRECTORY);
    if legacy_dir == data_dir || !legacy_dir.is_dir() {
        return Ok(());
    }

    for file_name in ["settings.json", "history.json", "history.db"] {
        let source = legacy_dir.join(file_name);
        let destination = data_dir.join(file_name);
        if source.is_file() && !destination.exists() {
            fs::copy(source, destination).map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

pub(crate) fn migrate_legacy_api_key() -> Result<(), String> {
    let current = secure_entry()?;
    if current.get_password().is_ok() {
        return Ok(());
    }
    let legacy = Entry::new(LEGACY_APP_SERVICE, KEY_ACCOUNT).map_err(|err| err.to_string())?;
    if let Ok(api_key) = legacy.get_password() {
        current
            .set_password(&api_key)
            .map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        history_limit, history_path, load_history, migrate_legacy_installation, sort_history,
        write_json,
    };
    use crate::models::{AppSettings, AppState, Transcript};
    use std::{
        fs,
        sync::{
            atomic::{AtomicBool, AtomicU32},
            Arc, Mutex,
        },
    };

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
        settings.history_retention = "500".into();
        assert_eq!(history_limit(&settings), 500);
        settings.history_retention = "never".into();
        assert_eq!(history_limit(&settings), 0);
        settings.history_retention = "unexpected".into();
        assert_eq!(history_limit(&settings), 15);
    }

    #[test]
    fn legacy_settings_are_copied_without_overwriting_current_data() {
        let root = std::env::temp_dir().join(format!(
            "veskri-storage-migration-test-{}",
            std::process::id()
        ));
        let legacy = root.join("com.wisprtype.desktop");
        let current = root.join("dev.kingironman.veskri");
        fs::create_dir_all(&legacy).unwrap();
        fs::create_dir_all(&current).unwrap();
        fs::write(legacy.join("settings.json"), "legacy").unwrap();
        migrate_legacy_installation(&current).unwrap();
        assert_eq!(
            fs::read_to_string(current.join("settings.json")).unwrap(),
            "legacy"
        );
        fs::write(current.join("settings.json"), "current").unwrap();
        migrate_legacy_installation(&current).unwrap();
        assert_eq!(
            fs::read_to_string(current.join("settings.json")).unwrap(),
            "current"
        );
        fs::remove_dir_all(root).unwrap();
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

    #[test]
    fn legacy_json_history_is_migrated_to_sqlite() {
        let directory =
            std::env::temp_dir().join(format!("veskri-storage-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).expect("create test directory");
        let state = AppState {
            data_dir: directory.clone(),
            history_lock: Mutex::new(()),
            recording: Mutex::new(None),
            recording_level: Arc::new(AtomicU32::new(0)),
            recording_error: Arc::new(Mutex::new(None)),
            last_failed_audio: Mutex::new(None),
            global_shortcut_available: AtomicBool::new(true),
        };
        write_json(
            history_path(&state),
            &vec![transcript("legacy", "2026-01-03T00:00:00Z", false)],
        )
        .expect("write legacy history");

        let migrated = load_history(&state);

        assert_eq!(migrated.len(), 1);
        assert_eq!(migrated[0].id, "legacy");
        assert!(!history_path(&state).exists());
        let _ = fs::remove_dir_all(directory);
    }
}
