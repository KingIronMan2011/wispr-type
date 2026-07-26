use serde::Serialize;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

pub(crate) const OVERLAY_LABEL: &str = "dictation-overlay";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OverlayPayload {
    state: String,
    message: String,
}

fn place_at_top_center(app: &AppHandle, window: &WebviewWindow) {
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return;
    };
    let Ok(window_size) = window.outer_size() else {
        return;
    };
    let monitor_size = monitor.size();
    let monitor_position = monitor.position();
    let x = monitor_position.x
        + i32::try_from(monitor_size.width.saturating_sub(window_size.width) / 2).unwrap_or(0);
    let y = monitor_position.y + 12;
    let _ = window.set_position(PhysicalPosition::new(x, y));
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
    .inner_size(286.0, 62.0)
    .min_inner_size(286.0, 62.0)
    .max_inner_size(286.0, 62.0)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .visible(false)
    .build()?;
    overlay.set_ignore_cursor_events(true)?;
    place_at_top_center(app, &overlay);
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
