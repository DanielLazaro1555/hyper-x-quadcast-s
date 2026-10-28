// SPDX-License-Identifier: GPL-2.0-or-later
//! Interfaz web incrustada en el binario (`web/dist`, generada con `npm run build`).

use include_dir::{include_dir, Dir};

static DIST: Dir = include_dir!("$CARGO_MANIFEST_DIR/web/dist");

pub struct Asset {
    pub body: &'static [u8],
    pub content_type: &'static str,
}

fn content_type(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "svg" => "image/svg+xml",
        "glb" => "model/gltf-binary",
        "json" => "application/json",
        "png" => "image/png",
        _ => "application/octet-stream",
    }
}

/// Busca un archivo por la ruta de la URL. `/` sirve `index.html`.
pub fn lookup(url: &str) -> Option<Asset> {
    let path = url.split(['?', '#']).next().unwrap_or("");
    let path = path.trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };
    // Las rutas de la URL nunca deben salir del directorio incrustado.
    if path.split('/').any(|part| part == ".." || part.is_empty()) {
        return None;
    }
    let file = DIST.get_file(path)?;
    Some(Asset { body: file.contents(), content_type: content_type(path) })
}
