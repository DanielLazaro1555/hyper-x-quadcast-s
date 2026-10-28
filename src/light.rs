//! Hilo que mantiene el color: el micrófono necesita que se reenvíe en bucle.
//! No abre el USB hasta la primera orden, para no quitarle `usbhid` sin necesidad.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use serde::Serialize;

use crate::device::Mic;

pub const FRAME_INTERVAL: Duration = Duration::from_millis(55);
const RETRY_INTERVAL: Duration = Duration::from_secs(1);

#[derive(Clone, Debug, Default, Serialize)]
pub struct Status {
    pub connected: bool,
    pub error: Option<String>,
    pub rgb: Option<[u8; 3]>,
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

    while shared.running.load(Ordering::SeqCst) {
        let Some(rgb) = *lock(&shared.target) else {
            wait_next_frame(shared);
            continue;
        };

        if mic.is_none() {
            match Mic::open() {
                Ok(m) => mic = Some(m),
                Err(error) => {
                    set_status(shared, Status { connected: false, error: Some(error), rgb: Some(rgb) });
                    thread::sleep(RETRY_INTERVAL);
                    continue;
                }
            }
        }

        let result = mic.as_ref().map(|m| m.send_frame(rgb)).unwrap_or(Ok(()));
        match result {
            Ok(()) => {
                set_status(shared, Status { connected: true, error: None, rgb: Some(rgb) });
                wait_next_frame(shared);
            }
            Err(error) => {
                mic = None; // libera las interfaces antes de reintentar
                set_status(shared, Status { connected: false, error: Some(error), rgb: Some(rgb) });
                thread::sleep(RETRY_INTERVAL);
            }
        }
    }
    // Al salir, `mic` se suelta y `usbhid` vuelve a las interfaces.
}
