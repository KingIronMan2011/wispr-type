use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlatformCapabilities {
    os: &'static str,
    display_name: &'static str,
    session: &'static str,
    auto_paste_supported: bool,
    global_shortcut_supported: bool,
}

pub(crate) fn capabilities(global_shortcut_supported: bool) -> PlatformCapabilities {
    PlatformCapabilities {
        os: std::env::consts::OS,
        display_name: display_name(),
        session: session(),
        auto_paste_supported: auto_paste_supported(),
        global_shortcut_supported,
    }
}

pub(crate) fn auto_paste_supported() -> bool {
    #[cfg(target_os = "linux")]
    {
        !is_wayland()
    }
    #[cfg(not(target_os = "linux"))]
    {
        true
    }
}

pub(crate) fn credential_store_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "Windows Credential Manager"
    }
    #[cfg(target_os = "linux")]
    {
        "your Linux keyring"
    }
    #[cfg(target_os = "macos")]
    {
        "macOS Keychain"
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        "your operating system credential store"
    }
}

pub(crate) fn microphone_permission_hint() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "Check Settings > Privacy & security > Microphone."
    }
    #[cfg(target_os = "linux")]
    {
        "Check your desktop’s microphone permissions and PipeWire or PulseAudio settings."
    }
    #[cfg(target_os = "macos")]
    {
        "Check System Settings > Privacy & Security > Microphone."
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        "Check your operating system’s microphone permissions."
    }
}

pub(crate) fn auto_paste_permission_hint() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Allow Wispr Type in System Settings > Privacy & Security > Accessibility."
    }
    #[cfg(target_os = "windows")]
    {
        "Check that the target app accepts simulated keyboard input."
    }
    #[cfg(target_os = "linux")]
    {
        "Use an X11 session, or paste from the clipboard manually on Wayland."
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        "Check your operating system's accessibility permissions."
    }
}

fn display_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "Windows"
    }
    #[cfg(target_os = "linux")]
    {
        "Linux"
    }
    #[cfg(target_os = "macos")]
    {
        "macOS"
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        "this device"
    }
}

fn session() -> &'static str {
    #[cfg(target_os = "linux")]
    {
        if is_wayland() {
            "wayland"
        } else {
            "x11"
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        "native"
    }
}

#[cfg(target_os = "linux")]
fn is_wayland() -> bool {
    std::env::var("XDG_SESSION_TYPE").is_ok_and(|session| session.eq_ignore_ascii_case("wayland"))
        || std::env::var_os("WAYLAND_DISPLAY").is_some()
}
