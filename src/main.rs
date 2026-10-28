// SPDX-License-Identifier: GPL-2.0-or-later
mod audio;
mod device;
mod light;
mod protocol;
mod server;

use std::process::ExitCode;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use device::Mic;

const USAGE: &str = "\
uso: quadcast-s <comando>

  color <RRGGBB> [opciones]   fija un color (por defecto hasta Ctrl+C)
  off [opciones]              apaga las luces (envía negro)
  watch                       muestra los eventos del sensor de silencio
  mute [on|off|toggle]        silencia o reactiva el audio (sin argumento, muestra el estado)
  serve                       API local para la interfaz web (127.0.0.1:7878)
  info                        detecta el micrófono

opciones de color y off:
  -b, --brightness N   brillo de 0 a 100 (por defecto 100)
  --once               envía un solo fotograma y sale (para probar si el color persiste)
  --secs N             mantiene el color N segundos";

fn running_flag() -> Arc<AtomicBool> {
    let running = Arc::new(AtomicBool::new(true));
    let flag = Arc::clone(&running);
    if let Err(e) = ctrlc::set_handler(move || flag.store(false, Ordering::SeqCst)) {
        eprintln!("aviso: no se pudo instalar el manejo de Ctrl+C: {e}");
    }
    running
}

struct ColorOptions {
    once: bool,
    secs: Option<u64>,
    brightness: u8,
}

fn parse_color_options(args: &[String]) -> Result<ColorOptions, String> {
    let mut opts = ColorOptions { once: false, secs: None, brightness: 100 };
    let mut it = args.iter();
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--once" => opts.once = true,
            "--brightness" | "-b" => {
                let n = it.next().ok_or("--brightness necesita un número de 0 a 100")?;
                opts.brightness = n
                    .parse::<u8>()
                    .ok()
                    .filter(|b| *b <= 100)
                    .ok_or_else(|| format!("'{n}' no es un brillo válido (0 a 100)"))?;
            }
            "--secs" => {
                let n = it.next().ok_or("--secs necesita un número")?;
                opts.secs = Some(n.parse().map_err(|_| format!("'{n}' no es un número"))?);
            }
            other => return Err(format!("opción desconocida '{other}'")),
        }
    }
    Ok(opts)
}

fn run_color(rgb: [u8; 3], opts: ColorOptions) -> Result<(), String> {
    let rgb = protocol::apply_brightness(rgb, opts.brightness);
    let mic = Mic::open()?;
    let running = running_flag();
    let deadline = opts.secs.map(|s| Instant::now() + Duration::from_secs(s));

    mic.send_frame(rgb)?;
    while !opts.once
        && running.load(Ordering::SeqCst)
        && deadline.map_or(true, |d| Instant::now() < d)
    {
        thread::sleep(light::FRAME_INTERVAL);
        mic.send_frame(rgb)?;
    }
    Ok(())
}

fn run_watch() -> Result<(), String> {
    let mic = Mic::open()?;
    let running = running_flag();
    println!("escuchando el sensor de silencio (Ctrl+C para salir)...");

    while running.load(Ordering::SeqCst) {
        if let Some(report) = mic.read_report()? {
            let hex: Vec<String> = report.iter().map(|b| format!("{b:02x}")).collect();
            println!("informe: {}", hex.join(" "));
        }
    }
    Ok(())
}

fn run_serve() -> Result<(), String> {
    let running = running_flag();
    let light = light::Light::spawn();
    server::serve(&light, &running)
    // `light` se suelta aquí: el hilo termina y se devuelve `usbhid`.
}

fn run_mute(action: Option<&str>) -> Result<(), String> {
    let muted = match action {
        None => audio::is_muted()?,
        Some("on") => audio::set_muted(true)?,
        Some("off") => audio::set_muted(false)?,
        Some("toggle") => audio::set_muted(!audio::is_muted()?)?,
        Some(other) => return Err(format!("'{other}' no es válido; usa on, off o toggle")),
    };
    println!("audio {}", if muted { "silenciado" } else { "activo" });
    Ok(())
}

fn run(args: &[String]) -> Result<(), String> {
    match args.first().map(String::as_str) {
        Some("color") => {
            let hex = args.get(1).ok_or("falta el color, p. ej. ff0000")?;
            run_color(protocol::parse_hex_color(hex)?, parse_color_options(&args[2..])?)
        }
        Some("off") => run_color([0, 0, 0], parse_color_options(&args[1..])?),
        Some("watch") => run_watch(),
        Some("mute") => run_mute(args.get(1).map(String::as_str)),
        Some("serve") => run_serve(),
        Some("info") => device::info().map(|line| println!("{line}")),
        _ => Err(USAGE.to_string()),
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(msg) => {
            eprintln!("{msg}");
            ExitCode::FAILURE
        }
    }
}
