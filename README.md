# hyper-x-quadcast-s

Control del HyperX QuadCast S en Linux, escrito en Rust. HyperX solo ofrece NGENUITY, que es solo para Windows.

Este proyecto nació de aplicar ingeniería inversa al micrófono. Lo que se sabe del protocolo está en [`docs/PROTOCOL.md`](docs/PROTOCOL.md), con cada dato marcado como verificado, tomado de otra fuente o hipótesis.

## Estado

| Función | Estado |
|---|---|
| Color fijo (RGB) | Funciona. Probado con 8 colores. |
| Apagar las luces | Implementado (envía negro). Falta confirmarlo con esta herramienta. |
| Detectar el sensor de silencio | Implementado (`watch`). Falta probarlo con esta herramienta. |
| Efectos (`blink`, `cycle`, `wave`...) | No implementado. |
| Ganancia y patrón polar | Son controles físicos del micrófono, sin software. |
| Audio | Sin controlador: es USB Audio Class estándar. |

Probado con un micrófono `0951:171f`, `bcdDevice 0x6103`, en Fedora 43. Otras revisiones no están probadas.

## Requisitos

- Rust (`cargo`).
- `libusb` con archivos de desarrollo. En Fedora: `sudo dnf install libusb1-devel`.
- Permiso de acceso al dispositivo USB. En este equipo bastó el usuario normal, sin `sudo`.

## Uso

```
cargo build --release
./target/release/quadcast-s info
./target/release/quadcast-s color ff0000
./target/release/quadcast-s color 00ff00 --secs 10
./target/release/quadcast-s off
./target/release/quadcast-s watch
```

| Comando | Qué hace |
|---|---|
| `info` | Detecta el micrófono y muestra su versión de dispositivo |
| `color RRGGBB` | Fija un color. Se mantiene hasta `Ctrl+C`. |
| `off` | Envía negro, igual que `color 000000` |
| `watch` | Imprime los informes del sensor de silencio |
| `--secs N` | Mantiene el color N segundos |
| `--once` | Envía un solo fotograma y sale. Sirve para probar si el color persiste. |

El color se reenvía cada 55 ms, como hace QuadcastRGB. Para dejarlo en segundo plano usa `&` en el shell.

## Controlador del kernel

La herramienta desconecta `usbhid` de las interfaces del micrófono mientras corre, y lo vuelve a conectar al salir, también con `Ctrl+C`. Mientras tanto, el sensor de silencio no llega a `/dev/hidraw*`. Si un proceso muere sin liberar las interfaces, es posible que haga falta reconectar el USB. Esto último es una hipótesis sin comprobar.

No ejecutes a la vez esta herramienta y `quadcastrgb`: los dos reclaman las mismas interfaces.

## Estructura

```
src/protocol.rs   paquetes del micrófono (con pruebas contra la captura real)
src/main.rs       acceso USB y línea de comandos
docs/PROTOCOL.md  protocolo y resultados de la ingeniería inversa
references/       clon de QuadcastRGB, solo como referencia (no se sube a git)
```

Para correr las pruebas, que no necesitan el micrófono: `cargo test`.

## Cómo se averiguó

1. Se leyó el código de [QuadcastRGB](https://github.com/Ors1mer/QuadcastRGB) para conocer el protocolo del RGB.
2. Se escuchó el micrófono en modo solo lectura (`hidraw` y `/dev/input`) para ver el sensor de silencio.
3. Se capturó el bus USB con `tcpdump -i usbmon1` mientras se enviaba un color, y se decodificó la cabecera `usbmon`. Confirmó que el micrófono aceptaba los paquetes.
4. Se reescribió el envío en Rust y se comprobó con la captura real.

Se intentó usar [REA](https://github.com/morluto/rea) como herramienta de ingeniería inversa, pero no aportó nada hasta ahora: no tiene ningún motor de análisis instalado (Ghidra, Hopper, IDA o Kuna). Solo serviría para desensamblar NGENUITY.

## Pendiente

Ver la lista de [`docs/PROTOCOL.md`](docs/PROTOCOL.md#pendiente).

## Créditos

- [QuadcastRGB](https://github.com/Ors1mer/QuadcastRGB), de Ors1mer (GPL-2.0), fue la fuente principal para conocer el protocolo del RGB. Este proyecto no copia su código: es una reimplementación en Rust, y los paquetes se contrastaron con una captura `usbmon` propia.
- [REA](https://github.com/morluto/rea), de morluto, se probó como herramienta de ingeniería inversa.

## Licencia

MIT. Pendiente de confirmar, por la relación con QuadcastRGB (GPL-2.0).
