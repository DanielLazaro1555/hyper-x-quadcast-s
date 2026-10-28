// SPDX-License-Identifier: GPL-2.0-or-later
//! Hilo que mantiene el color y escucha el sensor de mute del QuadCast S.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::device::Mic;

pub const FRAME_INTERVAL: Duration = Duration::from_millis(55);
const RETRY_INTERVAL: Duration = Duration::from_secs(1);
const MUTE_STATUS_INTERVAL: Duration = Duration::from_millis(400);

#[derive(Clone, Debug, Default, Serialize)]
pub struct Status {
    pub connected: bool,
    pub error: Option<String>,
    pub rgb: Option<[u8; 3]>,
    /// `None` until the HID status query returns a valid report.
    pub muted: Option<bool>,
}

#[derive(Default)]
struct Shared {
    target: Mutex<Option<[u8; 3]>>,
    status: Mutex<Status>,
    running: AtomicBool,
    /// Despierta al hilo cuando llega una orden nueva, en vez de esperar al
    /// siguiente fotograma.
    wake: Condvar,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    // Un pánico en otro hilo no invalida los datos: son valores simples.
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub struct Light {
    shared: Arc<Shared>,
    thread: Option<JoinHandle<()>>,
}

impl Light {
    pub fn spawn() -> Self {
        let shared = Arc::new(Shared::default());
        shared.running.store(true, Ordering::SeqCst);
        let worker = Arc::clone(&shared);
        let thread = thread::spawn(move || run(&worker));
        Light { shared, thread: Some(thread) }
    }

    pub fn set(&self, rgb: [u8; 3]) {
        *lock(&self.shared.target) = Some(rgb);
        self.shared.wake.notify_one();
    }

    pub fn status(&self) -> Status {
        lock(&self.shared.status).clone()
    }
}

impl Drop for Light {
    fn drop(&mut self) {
        self.shared.running.store(false, Ordering::SeqCst);
        self.shared.wake.notify_one();
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

fn set_status(shared: &Shared, status: Status) {
    *lock(&shared.status) = status;
}

/// Espera el siguiente fotograma, o menos si llega una orden nueva.
fn wait_next_frame(shared: &Shared) {
    let guard = lock(&shared.target);
    let _ = shared
        .wake
        .wait_timeout(guard, FRAME_INTERVAL)
        .unwrap_or_else(|e| e.into_inner());
}

fn run(shared: &Shared) {
    let mut mic: Option<Mic> = None;
    let mut muted: Option<bool> = None;
    let mut last_mute_event: Option<u8> = None;
    let mut next_mute_status = Instant::now();

    while shared.running.load(Ordering::SeqCst) {
        if mic.is_none() {
            match Mic::open() {
                Ok(m) => {
                    mic = Some(m);
                    next_mute_status = Instant::now();
                }
                Err(error) => {
                    muted = None;
                    last_mute_event = None;
                    set_status(shared, Status {
                        connected: false,
                        error: Some(error),
                        rgb: *lock(&shared.target),
                        muted,
                    });
                    thread::sleep(RETRY_INTERVAL);
                    continue;
                }
            }
        }

        let target = *lock(&shared.target);
        let result = match (mic.as_ref(), target) {
            (Some(device), Some(rgb)) => device.send_frame(rgb),
            _ => Ok(()),
        };
        match result {
            Ok(()) => {
                if let Some(device) = mic.as_ref() {
                    // El endpoint HID es interrupt y su intervalo de sondeo puede
                    // superar 2 ms; un timeout tan corto pierde eventos de mute.
                    let timeout = if target.is_some() { Duration::from_millis(20) } else { FRAME_INTERVAL };
                    if let Ok(Some(report)) = device.read_report_timeout(timeout) {
                        if let Some(event) = crate::protocol::mute_event_value(&report) {
                            if last_mute_event.is_some_and(|previous| previous != event) {
                                if let Some(state) = muted {
                                    muted = Some(!state);
                                }
                            }
                            last_mute_event = Some(event);
                            next_mute_status = Instant::now();
                        }
                    }
                    // La consulta de solo lectura obtiene el estado absoluto al inicio
                    // y corrige cualquier transición observada desde el último sondeo.
                    if Instant::now() >= next_mute_status {
                        if let Ok(Some(state)) = device.read_mute_status() {
                            muted = Some(state);
                        }
                        next_mute_status = Instant::now() + MUTE_STATUS_INTERVAL;
                    }
                }
                set_status(shared, Status { connected: true, error: None, rgb: target, muted });
                if target.is_some() {
                    wait_next_frame(shared);
                }
            }
            Err(error) => {
                mic = None; // libera las interfaces antes de reintentar
                muted = None;
                last_mute_event = None;
                set_status(shared, Status { connected: false, error: Some(error), rgb: target, muted });
                thread::sleep(RETRY_INTERVAL);
            }
        }
    }
    // Al salir, `mic` se suelta y `usbhid` vuelve a las interfaces.
}
