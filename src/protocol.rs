//! Construcción de paquetes del QuadCast S. Ver `docs/PROTOCOL.md`.

pub const PACKET_SIZE: usize = 64;

const HEADER_CODE: u8 = 0x04;
const DISPLAY_CODE: u8 = 0xf2;
const COLOR_CODE: u8 = 0x81;

pub type Packet = [u8; PACKET_SIZE];

/// Paquete de cabecera que precede a cada fotograma de color.
pub fn header_packet() -> Packet {
    let mut p = [0u8; PACKET_SIZE];
    p[0] = HEADER_CODE;
    p[1] = DISPLAY_CODE;
    p[8] = 0x01; // número de paquetes de datos
    p
}

/// Paquete de datos para un color fijo: el comando `81 RR GG BB` dos veces.
pub fn color_packet(rgb: [u8; 3]) -> Packet {
    let mut p = [0u8; PACKET_SIZE];
    for command in p.chunks_exact_mut(4).take(2) {
        command[0] = COLOR_CODE;
        command[1..].copy_from_slice(&rgb);
    }
    p
}

/// Atenúa un color como hace QuadcastRGB: cada canal por `percent / 100`, con
/// división entera. El micrófono no tiene un comando de brillo propio.
pub fn apply_brightness(rgb: [u8; 3], percent: u8) -> [u8; 3] {
    let percent = u16::from(percent.min(100));
    rgb.map(|c| (u16::from(c) * percent / 100) as u8)
}

/// Acepta `ff0000` o `#ff0000`.
pub fn parse_hex_color(s: &str) -> Result<[u8; 3], String> {
    let s = s.strip_prefix('#').unwrap_or(s);
    if s.len() != 6 || !s.is_ascii() {
        return Err(format!("color inválido '{s}': usa 6 dígitos hexadecimales, p. ej. ff0000"));
    }
    let byte = |i: usize| {
        u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| format!("color inválido '{s}'"))
    };
    Ok([byte(0)?, byte(2)?, byte(4)?])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_matches_capture() {
        let p = header_packet();
        assert_eq!(&p[..9], &[0x04, 0xf2, 0, 0, 0, 0, 0, 0, 0x01]);
        assert!(p[9..].iter().all(|&b| b == 0));
    }

    #[test]
    fn red_matches_capture() {
        let p = color_packet([0xff, 0x00, 0x00]);
        assert_eq!(&p[..8], &[0x81, 0xff, 0, 0, 0x81, 0xff, 0, 0]);
        assert!(p[8..].iter().all(|&b| b == 0));
    }

    #[test]
    fn green_matches_capture() {
        let p = color_packet([0x00, 0xff, 0x00]);
        assert_eq!(&p[..8], &[0x81, 0, 0xff, 0, 0x81, 0, 0xff, 0]);
    }

    #[test]
    fn brightness_scales_each_channel() {
        assert_eq!(apply_brightness([0xff, 0x80, 0x00], 100), [0xff, 0x80, 0x00]);
        assert_eq!(apply_brightness([0xff, 0x80, 0x00], 50), [0x7f, 0x40, 0x00]);
        assert_eq!(apply_brightness([0xff, 0xff, 0xff], 0), [0, 0, 0]);
        assert_eq!(apply_brightness([0xff, 0, 0], 200), [0xff, 0, 0]);
    }

    #[test]
    fn parses_colors() {
        assert_eq!(parse_hex_color("ff8000"), Ok([0xff, 0x80, 0x00]));
        assert_eq!(parse_hex_color("#00ff00"), Ok([0, 0xff, 0]));
        assert!(parse_hex_color("fff").is_err());
        assert!(parse_hex_color("gg0000").is_err());
        assert!(parse_hex_color("ñññ").is_err());
    }
}
