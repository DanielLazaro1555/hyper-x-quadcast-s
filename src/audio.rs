// SPDX-License-Identifier: GPL-2.0-or-later
//! Mute de captura del QuadCast S a través del control ALSA del kernel.
//!
//! El audio es un dispositivo USB aparte del RGB (`0951:171d`) y `snd-usb-audio`
//! es dueño de sus interfaces: una petición USB directa al Feature Unit la rechaza
//! el kernel (`EIO`), y quitarle la interfaz cortaría el audio. Lo que sí está
//! permitido es hablar con el control `Mic Capture Switch` que el propio kernel
//! expone en `/dev/snd/controlC*`, que él traduce a la petición UAC `SET_CUR`.
//! No usa PipeWire, PulseAudio ni `alsa-lib`: solo dos `ioctl`.

use std::fs::{self, File, OpenOptions};
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

fn element() -> ElemValue {
    let mut id = ElemId { numid: 0, iface: SNDRV_CTL_ELEM_IFACE_MIXER, device: 0, subdevice: 0, name: [0; 44], index: 0 };
    id.name[..CONTROL_NAME.len()].copy_from_slice(CONTROL_NAME.as_bytes());
    ElemValue { id, indirect: 0, value: [0; 128], reserved: [0; 128] }
}

fn ioctl(file: &File, request: libc::c_ulong, elem: &mut ElemValue) -> Result<(), String> {
    // SAFETY: `elem` es un `snd_ctl_elem_value` válido y vivo durante la llamada.
    let rc = unsafe { libc::ioctl(file.as_raw_fd(), request as _, elem as *mut ElemValue) };
    if rc < 0 {
        return Err(format!("falló el control '{CONTROL_NAME}': {}", std::io::Error::last_os_error()));
    }
    Ok(())
}

/// El control ALSA es un *switch* de captura: `1` = sonido pasa, `0` = silenciado.
pub fn is_muted() -> Result<bool, String> {
    let file = open_control()?;
    let mut elem = element();
    ioctl(&file, SNDRV_CTL_IOCTL_ELEM_READ, &mut elem)?;
    Ok(elem.value[0] == 0)
}

pub fn set_muted(muted: bool) -> Result<bool, String> {
    let file = open_control()?;
    let mut elem = element();
    elem.value[0] = if muted { 0 } else { 1 };
    ioctl(&file, SNDRV_CTL_IOCTL_ELEM_WRITE, &mut elem)?;
    is_muted()
}
