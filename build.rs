// SPDX-License-Identifier: GPL-2.0-or-later
//! La web compilada (`web/dist`) se incrusta en el binario. Si todavía no existe,
//! se deja una página que explica cómo generarla para que `cargo build` no falle.

use std::fs;
use std::path::Path;

fn main() {
    println!("cargo:rerun-if-changed=web/dist");
    let dist = Path::new("web/dist");
    if !dist.join("index.html").exists() {
        fs::create_dir_all(dist).expect("no se pudo crear web/dist");
        fs::write(
            dist.join("index.html"),
            "<!doctype html><meta charset=utf-8><title>QuadCast S</title>\
             <p>Esta compilacion no incluye la interfaz web. \
             Ejecuta <code>npm --prefix web run build</code> y vuelve a compilar.</p>",
        )
        .expect("no se pudo escribir web/dist/index.html");
    }
}
