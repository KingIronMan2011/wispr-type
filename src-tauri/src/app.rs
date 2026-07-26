use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

fn status_icon(activity: &str) -> Image<'static> {
    let (red, green, blue) = match activity {
        "recording" => (173, 103, 246),
        "transcribing" => (101, 157, 255),
        "success" => (83, 194, 132),
        "error" => (223, 101, 125),
        _ => (132, 132, 145),
    };
    let size = 32usize;
    let mut rgba = vec![0; size * size * 4];
    for y in 0..size {
        for x in 0..size {
            let dx = x as i32 - 15;
            let dy = y as i32 - 15;
            let index = (y * size + x) * 4;
            if dx * dx + dy * dy <= 13 * 13 {
                rgba[index..index + 4].copy_from_slice(&[red, green, blue, 255]);
            }
            if dx * dx + dy * dy <= 7 * 7 {
                rgba[index..index + 4].copy_from_slice(&[246, 245, 249, 255]);
            }
        }
    }
    Image::new_owned(rgba, size as u32, size as u32)
}

pub(crate) fn update_tray_activity(app: &AppHandle, activity: &str) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id("wispr-type-tray") {
        tray.set_icon(Some(status_icon(activity)))?;
    }
    Ok(())
}

pub(crate) fn set_up_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Open Wispr Type", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    TrayIconBuilder::with_id("wispr-type-tray")
        .icon(status_icon("ready"))
        .tooltip("Wispr Type — ready to dictate")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}
