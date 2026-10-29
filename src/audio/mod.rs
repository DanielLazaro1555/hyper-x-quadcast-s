// SPDX-License-Identifier: GPL-2.0-or-later
//! Audio del QuadCast S: mute de captura, mezclador e información del dispositivo.
//!
//! Cada sistema operativo tiene su propia forma de hablar con el audio, así que hay un
//! módulo por plataforma que ofrece las mismas funciones: `is_muted`, `set_muted`,
//! `mixer`, `set_control` e `info`.

use serde::Serialize;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::{info, is_muted, set_control, set_muted};

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::{info, is_muted, set_control, set_muted};

#[derive(Serialize)]
pub struct ControlState {
    pub id: &'static str,
    pub name: &'static str,
    pub kind: &'static str,
    pub values: Vec<i64>,
    pub min: i64,
    pub max: i64,
    /// Decibelios del valor mínimo; cada paso suma 1 dB. Solo en los volúmenes.
    pub db_min: Option<i64>,
}

/// Formato de un sentido (`Capture` o `Playback`) tal como lo declara el micrófono por USB y
/// lo resume el kernel en `/proc/asound/cardN/stream0`.
#[derive(Serialize, Default)]
pub struct StreamFormat {
    pub format: String,
    pub channels: u32,
    pub bits: u32,
    pub rates: Vec<u32>,
}

#[derive(Serialize)]
pub struct UsbDevice {
    pub id: String,
    pub product: String,
    pub manufacturer: String,
    pub version: String,
    pub speed_mbps: String,
    pub role: &'static str,
}

#[derive(Serialize)]
pub struct AudioInfo {
    pub card: Option<u32>,
    pub capture: Option<StreamFormat>,
    pub playback: Option<StreamFormat>,
    pub controls: Vec<ControlState>,
    pub usb: Vec<UsbDevice>,
}
