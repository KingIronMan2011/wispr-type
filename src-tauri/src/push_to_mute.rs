use crate::models::{AppSettings, AppState};
use enigo::{Direction, Enigo, Key, Keyboard, Settings as EnigoSettings};
use serde::Serialize;
use std::{sync::atomic::Ordering, thread, time::Duration};

const DISCORD_PUSH_TO_MUTE_KEYS: [Key; 4] = [Key::Control, Key::Alt, Key::Shift, Key::F12];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiscordPushToMuteStatus {
    pub(crate) supported: bool,
    pub(crate) configured: bool,
    pub(crate) message: String,
}

pub(crate) fn status(settings: &AppSettings) -> DiscordPushToMuteStatus {
    let supported = cfg!(windows);
    let message = if !supported {
        "Discord push-to-mute is currently available on Windows only.".into()
    } else if settings.discord_push_to_mute_enabled {
        "Veskri holds Discord’s Push To Mute shortcut while recording.".into()
    } else {
        "Set Discord’s Push To Mute shortcut to Ctrl + Alt + Shift + F12, then enable this integration."
            .into()
    };
    DiscordPushToMuteStatus {
        supported,
        configured: true,
        message,
    }
}

pub(crate) fn mute_for_dictation(state: &AppState, settings: &AppSettings) -> Result<(), String> {
    if !settings.discord_push_to_mute_enabled || !cfg!(windows) {
        return Ok(());
    }
    if state.discord_push_to_mute_held.swap(true, Ordering::AcqRel) {
        return Ok(());
    }
    if let Err(error) = send_discord_keybind(Direction::Press) {
        state
            .discord_push_to_mute_held
            .store(false, Ordering::Release);
        return Err(error);
    }
    Ok(())
}

pub(crate) fn restore_after_dictation(state: &AppState) -> Result<(), String> {
    if !state
        .discord_push_to_mute_held
        .swap(false, Ordering::AcqRel)
    {
        return Ok(());
    }
    send_discord_keybind(Direction::Release)
}

pub(crate) fn test_keybind() -> Result<(), String> {
    if !cfg!(windows) {
        return Err("Discord push-to-mute is currently available on Windows only.".into());
    }
    send_discord_keybind(Direction::Press)?;
    thread::sleep(Duration::from_millis(350));
    send_discord_keybind(Direction::Release)
}

fn send_discord_keybind(direction: Direction) -> Result<(), String> {
    let mut enigo = Enigo::new(&EnigoSettings::default())
        .map_err(|error| format!("Couldn’t prepare Discord push-to-mute: {error}"))?;
    let keys = match direction {
        Direction::Press => DISCORD_PUSH_TO_MUTE_KEYS.as_slice(),
        Direction::Release => {
            let mut keys = DISCORD_PUSH_TO_MUTE_KEYS;
            keys.reverse();
            return keys.iter().try_for_each(|key| {
                enigo
                    .key(*key, Direction::Release)
                    .map_err(|error| format!("Couldn’t release Discord push-to-mute: {error}"))
            });
        }
        Direction::Click => unreachable!("push-to-mute needs an explicit press or release"),
    };
    for (index, key) in keys.iter().enumerate() {
        if let Err(error) = enigo.key(*key, Direction::Press) {
            for released_key in keys[..index].iter().rev() {
                let _ = enigo.key(*released_key, Direction::Release);
            }
            return Err(format!("Couldn’t hold Discord push-to-mute: {error}"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::status;
    use crate::models::AppSettings;

    #[test]
    fn status_explains_the_discord_keybind_setup() {
        let integration = status(&AppSettings::default());

        assert!(integration.configured);
        assert!(integration.message.contains("Ctrl + Alt + Shift + F12"));
    }

    #[test]
    fn status_reflects_an_enabled_integration() {
        let settings = AppSettings {
            discord_push_to_mute_enabled: true,
            ..AppSettings::default()
        };
        let integration = status(&settings);

        if cfg!(windows) {
            assert!(integration.supported);
            assert!(integration.message.contains("holds Discord"));
        } else {
            assert!(!integration.supported);
        }
    }
}
