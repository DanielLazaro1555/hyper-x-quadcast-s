// SPDX-License-Identifier: GPL-2.0-or-later
//! Acceso USB al QuadCast S (`0951:171f`).

use std::time::Duration;

use rusb::{DeviceHandle, GlobalContext};

use crate::protocol;

pub const VID: u16 = 0x0951;
pub const PID: u16 = 0x171f;

const REQUEST_TYPE_OUT: u8 = 0x21;
const REQUEST_SET_REPORT: u8 = 0x09;
const W_VALUE: u16 = 0x0300;
const W_INDEX: u16 = 0;
const FEATURE_REPORT_ID: u16 = 0x07;
const REQUEST_GET_REPORT: u8 = 0x01;
const INTERFACES: [u8; 2] = [0, 1];
const EP_IN: u8 = 0x82;
const TIMEOUT: Duration = Duration::from_secs(1);

fn not_found() -> String {
    format!("no encuentro el micrófono {VID:04x}:{PID:04x}")
}

/// Micrófono abierto con sus interfaces reclamadas. `libusb` desconecta `usbhid`
/// al reclamarlas; al soltar el valor se liberan y el controlador vuelve.
pub struct Mic {
    handle: DeviceHandle<GlobalContext>,
}

impl Mic {
    pub fn open() -> Result<Self, String> {
        let handle = rusb::open_device_with_vid_pid(VID, PID).ok_or_else(not_found)?;
        handle.set_auto_detach_kernel_driver(true).map_err(|e| {
            format!("no se pudo activar la desconexión automática del controlador: {e}")
        })?;
        // Si algo falla a mitad, `Drop` libera lo que se hubiera reclamado.
        let mic = Mic { handle };
        for iface in INTERFACES {
            mic.handle
                .claim_interface(iface)
                .map_err(|e| format!("no se pudo reclamar la interfaz {iface}: {e}"))?;
        }
        Ok(mic)
    }

    fn send(&self, packet: &protocol::Packet) -> Result<(), String> {
        let sent = self
            .handle
            .write_control(REQUEST_TYPE_OUT, REQUEST_SET_REPORT, W_VALUE, W_INDEX, packet, TIMEOUT)
            .map_err(|e| format!("falló la transferencia: {e}"))?;
        if sent != protocol::PACKET_SIZE {
            return Err(format!("se enviaron {sent} de {} bytes", protocol::PACKET_SIZE));
        }
        Ok(())
    }

    pub fn send_frame(&self, rgb: [u8; 3]) -> Result<(), String> {
        self.send(&protocol::header_packet())?;
        self.send(&protocol::color_packet(rgb))
    }

    /// Lee un informe del endpoint de eventos. `None` si no llegó ninguno a tiempo.
    pub fn read_report(&self) -> Result<Option<Vec<u8>>, String> {
        self.read_report_timeout(TIMEOUT)
    }

    /// Lee un informe de eventos con un tiempo corto para no frenar el envío RGB.
    pub fn read_report_timeout(&self, timeout: Duration) -> Result<Option<Vec<u8>>, String> {
        let mut buf = [0u8; 8];
        match self.handle.read_interrupt(EP_IN, &mut buf, timeout) {
            Ok(n) => Ok(Some(buf[..n].to_vec())),
            Err(rusb::Error::Timeout) => Ok(None),
            Err(e) => Err(format!("falló la lectura: {e}")),
        }
    }

    /// Consulta el estado actual guardado por el controlador QuadCast S.
    /// El informe 0x07 / comando 0x58 es una consulta de solo lectura.
    pub fn read_mute_status(&self) -> Result<Option<bool>, String> {
        let mut request = [0u8; 65];
        request[0] = FEATURE_REPORT_ID as u8;
        request[1] = 0x04;
        request[2] = 0x58;
        request[9] = 0x01;
        self.handle
            .write_control(
                REQUEST_TYPE_OUT,
                REQUEST_SET_REPORT,
                0x0300 | FEATURE_REPORT_ID,
                W_INDEX,
                &request,
                TIMEOUT,
            )
            .map_err(|e| format!("falló la consulta HID de mute: {e}"))?;

        let mut response = [0u8; 65];
        let len = self
            .handle
            .read_control(
                0xa1,
                REQUEST_GET_REPORT,
                0x0300 | FEATURE_REPORT_ID,
                W_INDEX,
                &mut response,
                TIMEOUT,
            )
            .map_err(|e| format!("falló la lectura HID de mute: {e}"))?;

        // Algunas interfaces HID incluyen el ID de informe en los bytes leídos;
        // otras lo consumen en wValue. Aceptamos ambas disposiciones del ACK.
        let (command_at, ack_at, muted_at) = if response[0] == FEATURE_REPORT_ID as u8 {
            (2, 4, 13)
        } else {
            (1, 3, 12)
        };
        if len <= muted_at || response[command_at] != 0x58 || response[ack_at] != 0x01 {
            return Ok(None);
        }
        match response[muted_at] {
            0 => Ok(Some(false)),
            1 => Ok(Some(true)),
            _ => Ok(None),
        }
    }
}

impl Drop for Mic {
    fn drop(&mut self) {
        for iface in INTERFACES {
            // Falla si la interfaz no se llegó a reclamar; no hay nada que deshacer.
            let _ = self.handle.release_interface(iface);
        }
    }
}

/// Detecta el micrófono sin reclamar sus interfaces.
pub fn info() -> Result<String, String> {
    let handle = rusb::open_device_with_vid_pid(VID, PID).ok_or_else(not_found)?;
    let desc = handle
        .device()
        .device_descriptor()
        .map_err(|e| format!("no se pudo leer el descriptor: {e}"))?;
    let v = desc.device_version();
    Ok(format!(
        "QuadCast S {VID:04x}:{PID:04x}, bcdDevice {}.{}.{}",
        v.major(),
        v.minor(),
        v.sub_minor()
    ))
}
