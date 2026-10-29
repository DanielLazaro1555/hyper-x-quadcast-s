// SPDX-License-Identifier: GPL-2.0-or-later
//! Windows: mute y volumen de captura del QuadCast S con la API de audio de Windows
//! (WASAPI, `IAudioEndpointVolume`). Es el mismo control que ofrece el icono de volumen
//! de Windows para el micrófono.
//!
//! El controlador USB de Windows no expone al mezclador la ganancia fina, la monitorización
//! ni los auriculares como hace ALSA, así que aquí solo están el volumen de captura y el
//! silencio.

use windows::core::Interface;
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{
    eCapture, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ,
};

use super::{AudioInfo, ControlState, UsbDevice};

const VID: u16 = 0x0951;
const RGB_PID: u16 = 0x171f;
const AUDIO_PID: u16 = 0x171d;

fn win<T>(result: windows::core::Result<T>, what: &str) -> Result<T, String> {
    result.map_err(|e| format!("{what}: {e}"))
}

/// Entrada de captura activa cuyo nombre contiene "QuadCast".
fn find_endpoint() -> Result<IMMDevice, String> {
    unsafe {
        // Cada hilo debe iniciar COM; si ya estaba iniciado, el resultado se ignora.
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let enumerator: IMMDeviceEnumerator =
            win(CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL), "no se pudo abrir el audio de Windows")?;
        let devices = win(enumerator.EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE), "no se pudo listar los micrófonos")?;
        let count = win(devices.GetCount(), "no se pudo contar los micrófonos")?;
        for i in 0..count {
            let device = win(devices.Item(i), "no se pudo leer un micrófono")?;
            let store = win(device.OpenPropertyStore(STGM_READ), "no se pudo leer las propiedades")?;
            let name = win(store.GetValue(&PKEY_Device_FriendlyName), "no se pudo leer el nombre")?;
            if name.to_string().to_ascii_lowercase().contains("quadcast") {
                return Ok(device);
            }
        }
    }
    Err("no encuentro el audio del QuadCast S (no aparece como micrófono en Windows)".to_string())
}

fn endpoint_volume() -> Result<IAudioEndpointVolume, String> {
    let device = find_endpoint()?;
    unsafe { win(device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None), "no se pudo controlar el volumen") }
}

pub fn is_muted() -> Result<bool, String> {
    let volume = endpoint_volume()?;
    unsafe { win(volume.GetMute(), "no se pudo leer el silencio").map(|m| m.as_bool()) }
}

pub fn set_muted(muted: bool) -> Result<bool, String> {
    let volume = endpoint_volume()?;
    unsafe { win(volume.SetMute(muted, std::ptr::null()), "no se pudo cambiar el silencio")? };
    is_muted()
}

fn mixer() -> Result<Vec<ControlState>, String> {
    let volume = endpoint_volume()?;
    let (level, muted) = unsafe {
        (
            win(volume.GetMasterVolumeLevelScalar(), "no se pudo leer el volumen")?,
            win(volume.GetMute(), "no se pudo leer el silencio")?.as_bool(),
        )
    };
    Ok(vec![
        ControlState {
            id: "capture_gain",
            name: "Volumen de captura",
            kind: "volume",
            values: vec![(level * 100.0).round() as i64],
            min: 0,
            max: 100,
            db_min: None,
        },
        // Igual que en Linux: 1 = el sonido pasa, 0 = silenciado.
        ControlState {
            id: "capture_switch",
            name: "Captura activa",
            kind: "switch",
            values: vec![i64::from(!muted)],
            min: 0,
            max: 1,
            db_min: None,
        },
    ])
}

pub fn set_control(id: &str, value: i64) -> Result<(), String> {
    let volume = endpoint_volume()?;
    match id {
        "capture_gain" => {
            if !(0..=100).contains(&value) {
                return Err("'capture_gain' va de 0 a 100".to_string());
            }
            unsafe { win(volume.SetMasterVolumeLevelScalar(value as f32 / 100.0, std::ptr::null()), "no se pudo cambiar el volumen") }
        }
        "capture_switch" => {
            if !(0..=1).contains(&value) {
                return Err("'capture_switch' va de 0 a 1".to_string());
            }
            unsafe { win(volume.SetMute(value == 0, std::ptr::null()), "no se pudo cambiar el silencio") }
        }
        other => Err(format!("control desconocido '{other}'")),
    }
}

/// Los dispositivos USB del micrófono que ve libusb. Windows no entrega aquí el fabricante
/// ni la velocidad sin abrirlos, así que solo se informa de su presencia.
fn usb_devices() -> Vec<UsbDevice> {
    let mut found = Vec::new();
    for device in rusb::devices().into_iter().flat_map(|list| list.iter().collect::<Vec<_>>()) {
        let Ok(desc) = device.device_descriptor() else { continue };
        if desc.vendor_id() != VID {
            continue;
        }
        let role = match desc.product_id() {
            RGB_PID => "RGB y sensor táctil (HID)",
            AUDIO_PID => "Audio (USB Audio Class 1.0 y HID)",
            _ => continue,
        };
        let v = desc.device_version();
        found.push(UsbDevice {
            id: format!("{:04x}:{:04x}", desc.vendor_id(), desc.product_id()),
            product: String::new(),
            manufacturer: String::new(),
            version: format!("{}{}.{}{}", v.major() / 10, v.major() % 10, v.minor(), v.sub_minor()),
            speed_mbps: String::new(),
            role,
        });
    }
    found.sort_by(|a, b| a.id.cmp(&b.id));
    found
}

pub fn info() -> AudioInfo {
    AudioInfo {
        card: None,
        capture: None,
        playback: None,
        controls: mixer().unwrap_or_default(),
        usb: usb_devices(),
    }
}
