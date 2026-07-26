use crate::{
    models::{AppState, GroqResponse, Transcript},
    storage::{
        history_limit, history_path, load_history, load_settings, secure_entry, sort_history,
        write_json,
    },
};
use chrono::Utc;
use enigo::{Direction, Enigo, Key, Keyboard, Settings as EnigoSettings};
use reqwest::multipart::{Form, Part};
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

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

pub(crate) fn copy_to_clipboard(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard()
        .write_text(text)
        .map_err(|err| err.to_string())
}

pub(crate) async fn transcribe_audio(
    app: AppHandle,
    state: &AppState,
    audio: Vec<u8>,
    mime_type: &str,
    output_action: &str,
) -> Result<Transcript, String> {
    if audio.is_empty() {
        return Err("No audio was captured.".into());
    }
    let api_key = secure_entry()?
        .get_password()
        .map_err(|_| "Add a Groq API key in Settings first.".to_string())?;
    let settings = load_settings(state);
    let part = Part::bytes(audio)
        .file_name("wispr-type-dictation.wav")
        .mime_str(mime_type)
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
        .bearer_auth(api_key)
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
    paste_text(&app, &text, output_action == "paste")?;
    let limit = history_limit(&settings);
    let item = Transcript {
        id: format!("{}-{}", Utc::now().timestamp_millis(), text.len()),
        text,
        created_at: Utc::now().to_rfc3339(),
        language: result.language.unwrap_or(settings.language),
        pinned: false,
    };
    if limit == 0 {
        return Ok(item);
    }
    let _guard = state
        .history_lock
        .lock()
        .map_err(|_| "History is unavailable".to_string())?;
    let mut history = load_history(state);
    history.insert(0, item.clone());
    sort_history(&mut history);
    history.truncate(limit);
    write_json(history_path(state), &history)?;
    Ok(item)
}
