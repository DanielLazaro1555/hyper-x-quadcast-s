// SPDX-License-Identifier: GPL-2.0-or-later
//! Linux: mute y mezclador del QuadCast S a través de los controles ALSA del kernel.
//!
//! El audio es un dispositivo USB aparte del RGB (`0951:171d`) y `snd-usb-audio`
//! es dueño de sus interfaces: una petición USB directa al Feature Unit la rechaza
//! el kernel (`EIO`), y quitarle la interfaz cortaría el audio. Lo que sí está
//! permitido es hablar con el control `Mic Capture Switch` que el propio kernel
//! expone en `/dev/snd/controlC*`, que él traduce a la petición UAC `SET_CUR`.
//! No usa PipeWire, PulseAudio ni `alsa-lib`: solo dos `ioctl`.

use std::fs::{self, File, OpenOptions};
use std::path::Path;

use super::{AudioInfo, ControlState, StreamFormat, UsbDevice};
use std::os::fd::AsRawFd;

const VID: &str = "0951";
const AUDIO_PID: &str = "171d";
const CONTROL_NAME: &str = "Mic Capture Switch";

const SNDRV_CTL_ELEM_IFACE_MIXER: i32 = 2;

/// `struct snd_ctl_elem_id` (include/uapi/sound/asound.h), 64 bytes.
#[repr(C)]
#[derive(Clone, Copy)]
struct ElemId {
    numid: u32,
    iface: i32,
    device: u32,
    subdevice: u32,
    name: [u8; 44],
    index: u32,
}

/// `struct snd_ctl_elem_value`, 1224 bytes en 64 bits. Solo se usa `value[0]`.
#[repr(C)]
struct ElemValue {
    id: ElemId,
    indirect: u32,
    value: [libc::c_long; 128],
    reserved: [u8; 128],
}

const IOC_READ_WRITE: libc::c_ulong = 3;
const fn iowr(nr: libc::c_ulong) -> libc::c_ulong {
    (IOC_READ_WRITE << 30)
        | ((std::mem::size_of::<ElemValue>() as libc::c_ulong) << 16)
        | ((b'U' as libc::c_ulong) << 8)
        | nr
}
const SNDRV_CTL_IOCTL_ELEM_READ: libc::c_ulong = iowr(0x12);
const SNDRV_CTL_IOCTL_ELEM_WRITE: libc::c_ulong = iowr(0x13);

/// Número de la tarjeta ALSA cuyo dispositivo USB es el audio del QuadCast S.
fn find_card() -> Result<u32, String> {
    let read = |dir: &std::path::Path, file: &str| {
        fs::read_to_string(dir.join(file)).map(|s| s.trim().to_string()).unwrap_or_default()
    };
    let entries = fs::read_dir("/sys/class/sound").map_err(|e| format!("no se pudo leer /sys/class/sound: {e}"))?;
    for entry in entries.flatten() {
        let Some(number) = entry.file_name().to_str().and_then(|n| n.strip_prefix("card")?.parse().ok())
        else {
            continue;
        };
        // La tarjeta cuelga de la interfaz USB; su dispositivo es el directorio padre.
        let usb = entry.path().join("device/..");
        if read(&usb, "idVendor") == VID && read(&usb, "idProduct") == AUDIO_PID {
            return Ok(number);
        }
    }
    Err(format!("no encuentro la tarjeta de audio {VID}:{AUDIO_PID}"))
}

fn open_control() -> Result<File, String> {
    let card = find_card()?;
    let path = format!("/dev/snd/controlC{card}");
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(&path)
        .map_err(|e| format!("no se pudo abrir {path}: {e}"))
}

fn element(name: &str) -> ElemValue {
    let mut id = ElemId { numid: 0, iface: SNDRV_CTL_ELEM_IFACE_MIXER, device: 0, subdevice: 0, name: [0; 44], index: 0 };
    id.name[..name.len()].copy_from_slice(name.as_bytes());
    ElemValue { id, indirect: 0, value: [0; 128], reserved: [0; 128] }
}

fn ioctl(file: &File, request: libc::c_ulong, elem: &mut ElemValue, name: &str) -> Result<(), String> {
    // SAFETY: `elem` es un `snd_ctl_elem_value` válido y vivo durante la llamada.
    let rc = unsafe { libc::ioctl(file.as_raw_fd(), request as _, elem as *mut ElemValue) };
    if rc < 0 {
        return Err(format!("falló el control '{name}': {}", std::io::Error::last_os_error()));
    }
    Ok(())
}

/// El control ALSA es un *switch* de captura: `1` = sonido pasa, `0` = silenciado.
pub fn is_muted() -> Result<bool, String> {
    let file = open_control()?;
    let mut elem = element(CONTROL_NAME);
    ioctl(&file, SNDRV_CTL_IOCTL_ELEM_READ, &mut elem, CONTROL_NAME)?;
    Ok(elem.value[0] == 0)
}

pub fn set_muted(muted: bool) -> Result<bool, String> {
    let file = open_control()?;
    let mut elem = element(CONTROL_NAME);
    elem.value[0] = if muted { 0 } else { 1 };
    ioctl(&file, SNDRV_CTL_IOCTL_ELEM_WRITE, &mut elem, CONTROL_NAME)?;
    is_muted()
}

/// Un control del mezclador que expone `snd-usb-audio` para este micrófono. Los rangos y los
/// decibelios salen de `amixer -c N contents` en el equipo de pruebas (un decibelio por paso).
struct ControlSpec {
    id: &'static str,
    name: &'static str,
    kind: &'static str,
    channels: usize,
    min: i64,
    max: i64,
    db_min: i64,
}

const CONTROLS: [ControlSpec; 6] = [
    ControlSpec { id: "capture_gain", name: "Mic Capture Volume", kind: "volume", channels: 2, min: 0, max: 15, db_min: -8 },
    ControlSpec { id: "capture_switch", name: "Mic Capture Switch", kind: "switch", channels: 1, min: 0, max: 1, db_min: 0 },
    ControlSpec { id: "monitor_volume", name: "Mic Playback Volume", kind: "volume", channels: 2, min: 0, max: 36, db_min: -30 },
    ControlSpec { id: "monitor_switch", name: "Mic Playback Switch", kind: "switch", channels: 1, min: 0, max: 1, db_min: 0 },
    ControlSpec { id: "headphone_volume", name: "Speaker Playback Volume", kind: "volume", channels: 2, min: 0, max: 31, db_min: -40 },
    ControlSpec { id: "headphone_switch", name: "Speaker Playback Switch", kind: "switch", channels: 1, min: 0, max: 1, db_min: 0 },
];

/// Estado actual de todos los controles del mezclador del micrófono.
pub fn mixer() -> Result<Vec<ControlState>, String> {
    let file = open_control()?;
    CONTROLS
        .iter()
        .map(|c| {
            let mut elem = element(c.name);
            ioctl(&file, SNDRV_CTL_IOCTL_ELEM_READ, &mut elem, c.name)?;
            Ok(ControlState {
                id: c.id,
                name: c.name,
                kind: c.kind,
                values: elem.value[..c.channels].iter().map(|v| *v as i64).collect(),
                min: c.min,
                max: c.max,
                db_min: (c.kind == "volume").then_some(c.db_min),
            })
        })
        .collect()
}

/// Cambia un control por su `id`. Un volumen pone todos sus canales al mismo valor.
pub fn set_control(id: &str, value: i64) -> Result<(), String> {
    let spec = CONTROLS.iter().find(|c| c.id == id).ok_or_else(|| format!("control desconocido '{id}'"))?;
    if value < spec.min || value > spec.max {
        return Err(format!("'{id}' va de {} a {}", spec.min, spec.max));
    }
    let file = open_control()?;
    let mut elem = element(spec.name);
    for v in elem.value[..spec.channels].iter_mut() {
        *v = value as libc::c_long;
    }
    ioctl(&file, SNDRV_CTL_IOCTL_ELEM_WRITE, &mut elem, spec.name)
}

fn parse_stream(text: &str, section: &str) -> Option<StreamFormat> {
    let mut lines = text.lines().skip_while(|l| l.trim() != format!("{section}:"));
    lines.next()?;
    let mut f = StreamFormat::default();
    for line in lines {
        if !line.starts_with(' ') {
            break; // empieza otra sección
        }
        let line = line.trim();
        if let Some(v) = line.strip_prefix("Format:") {
            f.format = v.trim().to_string();
        } else if let Some(v) = line.strip_prefix("Channels:") {
            f.channels = v.trim().parse().unwrap_or(0);
        } else if let Some(v) = line.strip_prefix("Bits:") {
            f.bits = v.trim().parse().unwrap_or(0);
        } else if let Some(v) = line.strip_prefix("Rates:") {
            f.rates = v.split(',').filter_map(|r| r.trim().parse().ok()).collect();
        }
    }
    (f.channels > 0).then_some(f)
}

fn read_trim(path: &Path) -> String {
    fs::read_to_string(path).map(|s| s.trim().to_string()).unwrap_or_default()
}

/// Los dos dispositivos USB del micrófono: el RGB con el sensor (171f) y el audio (171d).
pub fn usb_devices() -> Vec<UsbDevice> {
    let mut found = Vec::new();
    let Ok(entries) = fs::read_dir("/sys/bus/usb/devices") else { return found };
    for entry in entries.flatten() {
        let path = entry.path();
        if read_trim(&path.join("idVendor")) != VID {
            continue;
        }
        let pid = read_trim(&path.join("idProduct"));
        let role = match pid.as_str() {
            "171f" => "RGB y sensor táctil (HID)",
            p if p == AUDIO_PID => "Audio (USB Audio Class 1.0 y HID)",
            _ => continue,
        };
        found.push(UsbDevice {
            id: format!("{VID}:{pid}"),
            product: read_trim(&path.join("product")),
            manufacturer: read_trim(&path.join("manufacturer")),
            version: read_trim(&path.join("bcdDevice")),
            speed_mbps: read_trim(&path.join("speed")),
            role,
        });
    }
    found.sort_by(|a, b| a.id.cmp(&b.id));
    found
}

pub fn info() -> AudioInfo {
    let card = find_card().ok();
    let stream = card.and_then(|c| fs::read_to_string(format!("/proc/asound/card{c}/stream0")).ok());
    AudioInfo {
        card,
        capture: stream.as_deref().and_then(|t| parse_stream(t, "Capture")),
        playback: stream.as_deref().and_then(|t| parse_stream(t, "Playback")),
        controls: mixer().unwrap_or_default(),
        usb: usb_devices(),
    }
}
