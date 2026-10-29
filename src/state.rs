// SPDX-License-Identifier: GPL-2.0-or-later
//! Último color elegido, guardado en disco para recuperarlo al reiniciar el servicio.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::light::UiColor;

#[derive(Serialize, Deserialize)]
pub struct Saved {
    pub ui: UiColor,
    /// Lo que recibió el micrófono (ya con brillo, gamma y ganancias).
    pub rgb: [u8; 3],
}

#[cfg(windows)]
fn config_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(PathBuf::from)
}

#[cfg(not(windows))]
fn config_dir() -> Option<PathBuf> {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
    Some(base)
}

fn path() -> Option<PathBuf> {
    Some(config_dir()?.join("quadcast-s").join("state.json"))
}

pub fn load() -> Option<Saved> {
    serde_json::from_str(&fs::read_to_string(path()?).ok()?).ok()
}

/// Un fallo al guardar no debe afectar al control de la luz: solo se avisa.
pub fn save(saved: &Saved) {
    let Some(path) = path() else { return };
    let result = path
        .parent()
        .map(fs::create_dir_all)
        .transpose()
        .and_then(|_| fs::write(&path, serde_json::to_string(saved).unwrap_or_default()));
    if let Err(e) = result {
        eprintln!("no se pudo guardar el color: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guarda_y_recupera() {
        let dir = std::env::temp_dir().join(format!("quadcast-state-{}", std::process::id()));
        std::env::set_var("XDG_CONFIG_HOME", &dir);
        std::env::set_var("APPDATA", &dir);
        assert!(load().is_none());
        save(&Saved {
            ui: UiColor { color: "#ff8800".into(), brightness: 70, corrected: false },
            rgb: [10, 20, 30],
        });
        let got = load().expect("debe recuperarse");
        assert_eq!(got.ui.color, "#ff8800");
        assert_eq!(got.ui.brightness, 70);
        assert_eq!(got.rgb, [10, 20, 30]);
        let _ = fs::remove_dir_all(dir);
    }
}
