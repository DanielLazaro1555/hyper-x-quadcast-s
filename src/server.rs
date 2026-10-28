// SPDX-License-Identifier: GPL-2.0-or-later
//! API local para la interfaz web. Solo escucha en 127.0.0.1.
//!
//! Un servidor local que controla hardware es un blanco fácil si cualquier página
//! del navegador puede hablarle, así que se comprueba el `Host` (contra DNS
//! rebinding), el `Origin` y que el cuerpo sea JSON (lo que obliga a un preflight
//! CORS que este servidor nunca contesta).

use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;
use tiny_http::{Header, Method, Request, Response, Server};

use crate::audio;
use crate::light::{Light, UiColor};
use crate::protocol;

pub const PORT: u16 = 7878;

const ALLOWED_HOSTS: [&str; 2] = ["127.0.0.1:7878", "localhost:7878"];
const ALLOWED_ORIGINS: [&str; 2] = ["http://127.0.0.1:5173", "http://localhost:5173"];
const MAX_BODY: u64 = 1024;

#[derive(Deserialize)]
struct LightRequest {
    color: String,
    brightness: u8,
    /// Color elegido en la web antes de la corrección de gamma y ganancia.
    #[serde(default)]
    ui_color: Option<String>,
}

#[derive(Deserialize)]
struct AudioRequest {
    muted: bool,
}

type Reply = Response<std::io::Cursor<Vec<u8>>>;

fn reply(code: u16, body: &str) -> Reply {
    let json = Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
        .expect("cabecera estática válida");
    Response::from_string(body).with_status_code(code).with_header(json)
}

fn error(code: u16, msg: &str) -> Reply {
    reply(code, &serde_json::json!({ "error": msg }).to_string())
}

fn audio_reply(result: Result<bool, String>) -> Reply {
    match result {
        Ok(muted) => reply(200, &serde_json::json!({ "muted": muted }).to_string()),
        Err(msg) => error(500, &msg),
    }
}

fn header(request: &Request, name: &'static str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|h| h.field.equiv(name))
        .map(|h| h.value.as_str().to_string())
}

fn handle(request: &mut Request, light: &Light) -> Reply {
    let host = header(request, "Host").unwrap_or_default();
    if !ALLOWED_HOSTS.contains(&host.as_str()) {
        return error(403, "host no permitido");
    }
    if let Some(origin) = header(request, "Origin") {
        if !ALLOWED_ORIGINS.contains(&origin.as_str()) {
            return error(403, "origen no permitido");
        }
    }

    let status = || serde_json::to_string(&light.status()).unwrap_or_else(|_| "{}".into());

    match (request.method().clone(), request.url()) {
        (Method::Get, "/api/status") => reply(200, &status()),
        (Method::Get, "/api/audio") => audio_reply(audio::is_muted()),
        (Method::Post, "/api/audio") => {
            let is_json = header(request, "Content-Type")
                .is_some_and(|t| t.to_ascii_lowercase().starts_with("application/json"));
            if !is_json {
                return error(415, "se espera Content-Type: application/json");
            }
            let mut body = String::new();
            if request.as_reader().take(MAX_BODY).read_to_string(&mut body).is_err() {
                return error(400, "cuerpo ilegible");
            }
            match serde_json::from_str::<AudioRequest>(&body) {
                Ok(req) => audio_reply(audio::set_muted(req.muted)),
                Err(e) => error(400, &format!("JSON inválido: {e}")),
            }
        }
        (Method::Post, "/api/light") => {
            let is_json = header(request, "Content-Type")
                .is_some_and(|t| t.to_ascii_lowercase().starts_with("application/json"));
            if !is_json {
                return error(415, "se espera Content-Type: application/json");
            }
            let mut body = String::new();
            if request.as_reader().take(MAX_BODY).read_to_string(&mut body).is_err() {
                return error(400, "cuerpo ilegible");
            }
            let req: LightRequest = match serde_json::from_str(&body) {
                Ok(r) => r,
                Err(e) => return error(400, &format!("JSON inválido: {e}")),
            };
            if req.brightness > 100 {
                return error(400, "el brillo va de 0 a 100");
            }
            match protocol::parse_hex_color(&req.color) {
                Ok(rgb) => {
                    if let Some(ui) = req.ui_color.as_deref().filter(|c| protocol::parse_hex_color(c).is_ok()) {
                        light.set_ui(UiColor { color: ui.to_string(), brightness: req.brightness });
                    }
                    light.set(protocol::apply_brightness(rgb, req.brightness));
                    reply(200, &status())
                }
                Err(msg) => error(400, &msg),
            }
        }
        _ => error(404, "no existe"),
    }
}

pub fn serve(light: &Light, running: &Arc<AtomicBool>) -> Result<(), String> {
    let addr = format!("127.0.0.1:{PORT}");
    let server = Server::http(&addr).map_err(|e| format!("no se pudo abrir {addr}: {e}"))?;
    println!("API local en http://{addr} (Ctrl+C para salir)");

    while running.load(Ordering::SeqCst) {
        match server.recv_timeout(Duration::from_millis(250)) {
            Ok(Some(mut request)) => {
                let response = handle(&mut request, light);
                if let Err(e) = request.respond(response) {
                    eprintln!("no se pudo responder: {e}");
                }
            }
            Ok(None) => {}
            Err(e) => return Err(format!("falló el servidor: {e}")),
        }
    }
    Ok(())
}
