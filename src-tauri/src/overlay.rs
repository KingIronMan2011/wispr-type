use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub(crate) const OVERLAY_LABEL: &str = "dictation-overlay";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OverlayPayload {
    state: String,
    message: String,
}

pub(crate) fn create(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window(OVERLAY_LABEL).is_some() {
        return Ok(());
    }
    let overlay = WebviewWindowBuilder::new(
        app,
        OVERLAY_LABEL,
        WebviewUrl::App("index.html#dictation-overlay".into()),
    )
    .title("Wispr Type")
    .inner_size(390.0, 112.0)
    .min_inner_size(390.0, 112.0)
    .max_inner_size(390.0, 112.0)
    .center()
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .visible(false)
    .build()?;
    overlay.set_ignore_cursor_events(true)?;
    Ok(())
}

pub(crate) fn show(app: &AppHandle, state: &str, message: impl Into<String>) {
    let payload = OverlayPayload {
        state: state.into(),
        message: message.into(),
    };
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = window.show();
        let _ = window.set_ignore_cursor_events(true);
    }
    let _ = app.emit("wispr-overlay", payload);
}

pub(crate) fn hide(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = window.hide();
    }
}
