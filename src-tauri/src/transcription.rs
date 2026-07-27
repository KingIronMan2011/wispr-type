use crate::{
    models::{AppState, GroqResponse, Transcript},
    platform,
    storage::{
        history_limit, load_history, load_settings, save_history, secure_entry, sort_history,
    },
};
use chrono::Utc;
use enigo::{Enigo, Keyboard, Settings as EnigoSettings};
use reqwest::multipart::{Form, Part};
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

fn apply_voice_commands(text: String) -> String {
    let mut text = text;
    for (spoken, replacement) in [
        ("new paragraph", "\n\n"),
        ("New paragraph", "\n\n"),
        ("new line", "\n"),
        ("New line", "\n"),
        ("comma", ","),
        ("Comma", ","),
        ("period", "."),
        ("Period", "."),
        ("question mark", "?"),
        ("Question mark", "?"),
        ("exclamation mark", "!"),
        ("Exclamation mark", "!"),
        ("neuer Absatz", "\n\n"),
        ("Neuer Absatz", "\n\n"),
        ("neue Zeile", "\n"),
        ("Neue Zeile", "\n"),
        ("Komma", ","),
        ("komma", ","),
        ("Punkt", "."),
        ("punkt", "."),
        ("Fragezeichen", "?"),
        ("fragezeichen", "?"),
        ("Ausrufezeichen", "!"),
        ("ausrufezeichen", "!"),
    ] {
        text = text.replace(spoken, replacement);
    }
    text.replace(" ,", ",")
        .replace(" .", ".")
        .replace(" ?", "?")
        .replace(" !", "!")
        .replace(" \n", "\n")
        .replace("\n ", "\n")
}

fn polish_text(text: String) -> String {
    let mut polished = text
        .lines()
        .map(|line| {
            line.split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .replace(" ,", ",")
                .replace(" .", ".")
                .replace(" ?", "?")
                .replace(" !", "!")
        })
        .collect::<Vec<_>>()
        .join("\n");
    if let Some(first) = polished.chars().next() {
        let replacement = first.to_uppercase().collect::<String>();
        polished.replace_range(0..first.len_utf8(), &replacement);
    }
    polished
}

fn paste_text(app: &AppHandle, text: &str, should_paste: bool) -> Result<(), String> {
    if should_paste && platform::auto_paste_supported() {
        let mut enigo = Enigo::new(&EnigoSettings::default()).map_err(|err| {
            format!(
                "Could not prepare auto-paste: {err}. {}",
                platform::auto_paste_permission_hint()
            )
        })?;
        enigo.text(text).map_err(|err| {
            format!(
                "Could not auto-paste: {err}. {}",
                platform::auto_paste_permission_hint()
            )
        })?;
    } else {
        app.clipboard()
            .write_text(text)
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
    if !settings.personal_vocabulary.trim().is_empty() {
        let vocabulary = settings
            .personal_vocabulary
            .chars()
            .take(650)
            .collect::<String>();
        form = form.text("prompt", format!("Preferred spellings: {vocabulary}"));
    }
    if settings.language != "auto" {
        form = form.text("language", settings.language.clone());
    }
    let response = reqwest::Client::new()
        .post("https://api.groq.com/openai/v1/audio/transcriptions")
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|err| {
            if err.is_timeout() {
                "Groq did not respond in time. Check your connection and retry.".to_string()
            } else {
                "Couldn’t reach Groq. Check your internet connection or firewall and retry."
                    .to_string()
            }
        })?;
    let status = response.status();
    let body = response.text().await.map_err(|_| {
        "Groq sent a response that Wispr Type couldn’t read. Try again.".to_string()
    })?;
    if !status.is_success() {
        let message = match status.as_u16() {
            401 => "Groq rejected your API key. Replace it in Settings and try again.",
            403 => "Your Groq project does not have permission to transcribe audio.",
            413 => "That dictation is too large to send. Try a shorter recording.",
            429 => "Groq is rate-limiting this project. Your audio is ready to retry shortly.",
            500..=599 => "Groq is temporarily unavailable. Your audio is ready to retry.",
            _ => "Groq couldn’t transcribe this dictation. Your audio is ready to retry.",
        };
        return Err(message.into());
    }
    let result: GroqResponse = serde_json::from_str(&body)
        .map_err(|_| "Groq returned an unexpected transcription response.".to_string())?;
    let mut text = result.text.trim().to_string();
    if settings.voice_commands_enabled {
        text = apply_voice_commands(text);
    }
    if settings.text_mode == "polished" {
        text = polish_text(text);
    }
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
    save_history(state, &history)?;
    Ok(item)
}

#[cfg(test)]
mod tests {
    use super::{apply_voice_commands, polish_text};

    #[test]
    fn applies_english_and_german_dictation_commands() {
        assert_eq!(
            apply_voice_commands("Hello comma world new paragraph Neuer Absatz Ende Punkt".into()),
            "Hello, world\n\n\n\nEnde."
        );
    }

    #[test]
    fn polished_mode_preserves_paragraphs() {
        assert_eq!(
            polish_text("hello ,  world\n\nnext line !".into()),
            "Hello, world\n\nnext line!"
        );
    }
}
