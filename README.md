# hyper-x-quadcast-s

Control del HyperX QuadCast S en Linux: una herramienta en Rust, un servicio local y una interfaz web con el micrófono en 3D. HyperX solo ofrece NGENUITY, que es solo para Windows.

El proyecto nació de aplicar ingeniería inversa al micrófono. Lo que se sabe del protocolo está en [`docs/PROTOCOL.md`](docs/PROTOCOL.md), con cada dato marcado como verificado, tomado de otra fuente o hipótesis.

## Estado

| Función | Estado |
|---|---|
| Color fijo (RGB) y brillo | Funciona, en tiempo real desde la web |
| Interfaz web con el micrófono en 3D | Funciona en local. El modelo es estilizado, no una copia del producto. |
| Calibración de color (gamma y ganancia por canal) | Implementada. Aún no hay valores recomendados para colores mezclados como el marrón. |
| Medidor de audio en vivo (nivel, pico, saturación, espectro) | Implementado, pendiente de confirmar en uso |
| Apagar las luces (`off`) | Implementado (envía negro). No probado con esta herramienta. |
| Sensor de silencio (`watch`) | Implementado. No probado con esta herramienta. |
| Efectos (`blink`, `cycle`, `wave`...) | No implementado |
| Controles de audio (ganancia, volumen, monitoreo) | El kernel los expone por ALSA y se leyeron, pero la herramienta aún no los usa |
| Patrón polar | Se supone un control físico del micrófono. Sin comprobar. |

Probado con un micrófono `0951:171f`, `bcdDevice 0x6103`, en Fedora 43. Otras revisiones no están probadas.

## Requisitos

- Rust (`cargo`).
- `libusb` con archivos de desarrollo. En Fedora: `sudo dnf install libusb1-devel`.
- Node.js y `npm`, solo para la interfaz web.
- Permiso de acceso al dispositivo USB. En este equipo bastó el usuario normal, sin `sudo`.

## Uso rápido: la interfaz web

Hacen falta dos procesos:

```
# 1. el servicio que habla con el micrófono
cargo build --release
./target/release/quadcast-s serve

# 2. la web
cd web
npm install
npm run dev
```

Abre <http://127.0.0.1:5173/>. Desde ahí puedes:

- Elegir el color con el selector o con las muestras (hay una fila de colores mezclados).
- Bajar el brillo.
- Calibrar los colores mezclados (ver abajo).
- Abrir el medidor de audio.

La vista 3D siempre muestra el color original. Al micrófono llega el color ya corregido por la calibración.

### Calibración

Un LED RGB no reproduce las mezclas como una pantalla. El marrón, por ejemplo, tiende a verse más claro o blanquecino. La sección **Calibración** permite compensarlo mirando el micrófono real:

- **Gamma** (1,0 a 3,0): 1,0 no cambia nada. Valores cercanos a 2,2 oscurecen el verde y el azul respecto al rojo.
- **Ganancia de rojo, verde y azul** (0 a 100 %): reduce un canal que domine.

Los valores se guardan en el navegador. El botón *Restablecer calibración* los devuelve a 1,0 y 100 %.

### Medidor de audio

Mide el audio **en tu navegador**: no se graba ni se envía nada. Desactiva el procesado del navegador (eco, ruido y ganancia automática) para medir lo que entrega el micrófono. Muestra el nivel RMS y el pico en dBFS, el mínimo de los últimos 10 segundos (una estimación del ruido de fondo si hay silencio), un aviso de saturación y el espectro de 20 Hz a 20 kHz.

Limitaciones: el análisis mezcla los dos canales en uno, y sin una fuente de referencia no se puede dar una nota absoluta de calidad. Sirve para medir ruido y saturación, y para comparar ajustes entre sí.

## Línea de comandos

```
./target/release/quadcast-s info
./target/release/quadcast-s color ff0000
./target/release/quadcast-s color 00ff00 --brightness 50 --secs 10
./target/release/quadcast-s off
./target/release/quadcast-s watch
./target/release/quadcast-s serve
```

| Comando | Qué hace |
|---|---|
| `info` | Detecta el micrófono y muestra su versión de dispositivo |
| `color RRGGBB` | Fija un color. Se mantiene hasta `Ctrl+C`. |
| `off` | Envía negro, igual que `color 000000` |
| `watch` | Imprime los informes del sensor de silencio |
| `serve` | Arranca el servicio local para la interfaz web |
| `-b`, `--brightness N` | Brillo de 0 a 100 (por defecto 100) |
| `--secs N` | Mantiene el color N segundos |
| `--once` | Envía un solo fotograma y sale. Sirve para probar si el color persiste. |

El color se reenvía cada 55 ms, como hace QuadcastRGB. El brillo no es un comando del micrófono: se simula multiplicando cada canal de color por `brillo / 100`.

## Servicio local y seguridad

`quadcast-s serve` abre una API en `127.0.0.1:7878`:

| Ruta | Qué hace |
|---|---|
| `GET /api/status` | Estado: conectado, error, color y estado de mute conocido |
| `GET /api/audio` | Mute de audio del micrófono: `{"muted": bool}` |
| `POST /api/audio` | Cuerpo JSON `{"muted": true\|false}`; silencia o reactiva la captura de audio (control ALSA del kernel, sin PipeWire) |
| `POST /api/light` | Cuerpo JSON `{"color": "#rrggbb", "brightness": 0-100}` |

Un servicio local que controla hardware es un blanco fácil si cualquier página del navegador puede hablarle. Por eso solo escucha en `127.0.0.1`, y además:

- Comprueba la cabecera `Host` (contra DNS rebinding).
- Rechaza los `Origin` que no sean la propia web.
- Exige `Content-Type: application/json`, lo que obliga a un preflight CORS que el servicio nunca contesta.
- Limita el cuerpo de las peticiones a 1 KB.

En desarrollo, Vite hace de proxy de `/api` hacia el servicio, así que el navegador solo ve un origen.

Al iniciar `serve`, el servicio abre el USB, consulta el estado actual del mute y escucha cambios del sensor físico. La web refleja el estado y apaga el RGB del visor mientras está muteado; RGB del dispositivo sigue sin enviarse hasta que cambies un control.

## Controlador del kernel

La herramienta y el servicio desconectan `usbhid` de las interfaces del micrófono mientras las usan, y lo vuelven a conectar al salir. Se comprobó que `usbhid` vuelve a la interfaz 1 tras cerrar el servicio con `Ctrl+C`. Mientras tanto, el sensor de silencio no llega a `/dev/hidraw*`.

Cierra siempre con `Ctrl+C` (`SIGINT`). Una señal `SIGTERM` o `SIGKILL` no libera las interfaces, y quizá haga falta reconectar el USB. Esto último es una hipótesis sin comprobar.

No ejecutes a la vez `serve`, `color` o `quadcastrgb`: todos reclaman las mismas interfaces.

## Estructura

```
src/protocol.rs   paquetes del micrófono y brillo (con pruebas contra la captura real)
src/device.rs     acceso USB
src/light.rs      hilo que mantiene el color reenviándolo
src/server.rs     API local
src/main.rs       línea de comandos
web/src/state.ts            estado y cálculo de color y calibración
web/src/api.ts              cliente del servicio local
web/src/scene/              escena 3D (Three.js)
web/src/audio/meter.ts      captura y análisis del audio
web/src/ui/                 panel de controles y medidor
docs/PROTOCOL.md  protocolo y resultados de la ingeniería inversa
references/       clon de QuadcastRGB, solo como referencia (no se sube a git)
```

Pruebas, que no necesitan el micrófono:

```
cargo test
cd web && npm run typecheck
```

## Cómo se averiguó

1. Se leyó el código de [QuadcastRGB](https://github.com/Ors1mer/QuadcastRGB) para conocer el protocolo del RGB.
2. Se escuchó el micrófono en modo solo lectura (`hidraw` y `/dev/input`) para ver el sensor de silencio.
3. Se capturó el bus USB con `tcpdump -i usbmon1` mientras se enviaba un color, y se decodificó la cabecera `usbmon`. Confirmó que el micrófono aceptaba los paquetes.
4. Se reescribió el envío en Rust y se comprobó con la captura real.

Se intentó usar [REA](https://github.com/morluto/rea) como herramienta de ingeniería inversa, pero no aportó nada hasta ahora: no tiene ningún motor de análisis instalado (Ghidra, Hopper, IDA o Kuna). Solo serviría para desensamblar NGENUITY.

## Pendiente

Ver la lista de [`docs/PROTOCOL.md`](docs/PROTOCOL.md#pendiente). Además:

- Que el servicio sirva la web ya compilada, para distribuir un solo binario.
- Integrar los controles de audio de ALSA (ganancia de captura, volumen, monitoreo).
- Medir el ruido de fondo del micrófono en silencio real.
- Encontrar valores de calibración que den buenos colores mezclados, y fijarlos como valores por defecto.
- Preparar la distribución (regla `udev`, empaquetado, por ejemplo Flatpak).

## Créditos

- [QuadcastRGB](https://github.com/Ors1mer/QuadcastRGB), de Ors1mer (GPL-2.0), fue la fuente principal para conocer el protocolo del RGB. Este proyecto no copia su código: es una reimplementación en Rust, y los paquetes se contrastaron con una captura `usbmon` propia.
- [REA](https://github.com/morluto/rea), de morluto, se probó como herramienta de ingeniería inversa.

## Licencia

[GPL-2.0-or-later](LICENSE). Se eligió por tres motivos:

- Es compatible con QuadcastRGB (GPL-2.0), que fue la fuente del protocolo del RGB.
- Un eventual driver de kernel tiene que ser GPL-2.0, y así podría reutilizar este código.
- Las mejoras que se distribuyan deben seguir siendo abiertas.

Si colaboras, tu aportación se publica bajo la misma licencia. Cada archivo fuente lleva la cabecera `SPDX-License-Identifier: GPL-2.0-or-later`.
