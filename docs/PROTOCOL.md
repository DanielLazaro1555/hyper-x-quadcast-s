# HyperX QuadCast S: protocolo USB en Linux

Notas de ingeniería inversa del HyperX QuadCast S. Cada afirmación lleva una etiqueta:

- **[verificado]**: observado en este equipo (captura `usbmon`, `lsusb` o prueba visual).
- **[fuente]**: tomado del código de QuadcastRGB (`Ors1mer/QuadcastRGB` v1.0.5, GPL-2.0), no contrastado aquí.
- **[hipótesis]**: sin comprobar.

## Dispositivos

El micrófono aparece como dos dispositivos USB **[verificado]**:

| ID | Función | Interfaces |
|---|---|---|
| `0951:171d` | Audio (USB Audio Class) | 4, en `1-11.1` en este equipo |
| `0951:171f` | Controlador de luces y botones (HID) | 2: interfaz 0 (EP `0x01` OUT) y 1 (EP `0x82` IN), ambos interrupt |

- `171f` informa `bcdDevice 0x6103` **[verificado]**. Podría ser la versión de firmware **[hipótesis]**.
- El audio no necesita controlador: es USB Audio Class estándar **[fuente]**.

## RGB

Se envía con una transferencia de control **[verificado]** (captura `usbmon`, 150 transferencias con `status=0`):

| Campo | Valor |
|---|---|
| `bmRequestType` | `0x21` (host a dispositivo, clase, interfaz) |
| `bRequest` | `0x09` (`SET_REPORT`) |
| `wValue` | `0x0300` (feature report, ID 3) |
| `wIndex` | `0` (interfaz 0) |
| Longitud | 64 bytes |

Cada fotograma son dos paquetes seguidos:

1. **Cabecera**: `04 f2 00 00 00 00 00 00 01` y ceros hasta 64 bytes.
2. **Datos**: comandos de color de 4 bytes, `81 RR GG BB`. En modo `solid` se repite el comando dos veces (8 bytes) y el resto son ceros.
   - Rojo `ff0000` viaja como `81 ff 00 00 81 ff 00 00 ...` **[verificado]**.
   - Verde `00ff00` viaja como `81 00 ff 00 81 00 ff 00 ...` **[verificado]**.

QuadcastRGB repite el fotograma en bucle, con 55 ms de pausa **[fuente]**. No he comprobado si el micrófono conserva el color si se deja de enviar **[hipótesis]**. La herramienta en Rust incluye `--once` para probarlo.

### Controlador del kernel

Las interfaces 0 y 1 de `171f` las usa `usbhid`. `libusb` las desconecta al reclamarlas:

- Mientras corre `quadcastrgb`, ambas interfaces quedan en `usbfs` **[verificado]**.
- Entonces desaparece `/dev/hidraw*` del micrófono y no se leen los eventos de silencio **[verificado]**.
- Al terminar, el controlador debe reconectarse. Si el proceso muere sin liberar las interfaces, puede no volver hasta reconectar el USB **[hipótesis]**.

### Colores

- El color son 3 bytes (R, G, B), es decir 256³ = 16,7 millones de combinaciones en el paquete **[fuente]**. No se ha comprobado cuántos distingue el hardware **[hipótesis]**.
- La herramienta en Rust (`quadcast-s color`) envió 8 colores, 4 s cada uno: `ff0000`, `00ff00`, `0000ff`, `ffff00`, `ff00ff`, `00ffff`, `ff8000` y `8000ff`. Se confirmó visualmente que el micrófono cambió de color, sin anotar uno por uno **[verificado]**.
- Tras cada ejecución, la interfaz 1 volvió a `usbhid` **[verificado]**. La interfaz 0 quedó sin controlador. No se sabe si lo tenía antes de la primera prueba, porque no se miró en reposo **[hipótesis abierta]**.

### Pruebas fallidas al principio

Las primeras pruebas (`solid ff0000`, `solid 00ff00`) no encendieron la luz, aunque `usbmon` mostraba que el micrófono aceptaba los paquetes. Más tarde, el mismo `solid ff0000` sí funcionó. **No se ha determinado la causa [hipótesis abierta].**

Descartado: el brillo. El valor por defecto de QuadcastRGB ya es 100 (`MAX_BR_SPD_DLY`, `argparser.c`), así que `-b 100` no cambia nada.

## Eventos del micrófono

El sensor táctil de silencio genera **[verificado]**:

- En `hidraw` (interfaz 1): un informe de 8 bytes `05 10 XX 00 00 00 00 00`. **`XX` es el estado absoluto: `01` = micrófono activo (LED superior encendido), `00` = silenciado.** Verificado tocando el sensor: secuencia `01`, `00`, `01`, y tras el último el LED quedó encendido.
- En `/dev/input/event*` ("Consumer Control"): `BTN_0` (código 256), pulsar y soltar.
- El sensor silencia **por hardware**: no cambia el interruptor ALSA `Mic Capture Switch` **[verificado]**. Son dos mutes independientes (ver más abajo).

La consulta HID de función `0x07`, comando `0x58` que describe OpenHyperX **no responde con datos en este micrófono** (`0951:171f`): devuelve `00 00 00 ff 00 …`, sin comando ni ACK **[verificado]**. Por eso el estado inicial es desconocido hasta el primer toque; el servicio muestra «pendiente» y no lo adivina. La consulta se mantiene por si otro firmware sí responde.

HyperX indica que el LED superior encendido significa micrófono activo y apagado significa mute.

La perilla de ganancia **no generó eventos** en 60 s de escucha. Es coherente con un control analógico por hardware **[hipótesis]**.

## Mute de audio (control ALSA del kernel)

El sensor táctil **no se puede accionar por HID**: solo se lee. Lo que sí se puede cambiar desde el ordenador es el mute de la captura de audio, que vive en el propio micrófono. No depende de PipeWire, PulseAudio ni `alsa-lib`.

El audio es un dispositivo USB distinto del RGB: `0951:171d` (el RGB y el sensor son `0951:171f`). Su interfaz 0 es AudioControl (UAC 1.0). El camino de captura es `terminal 2 (micrófono) → Feature Unit 10 → Selector 8 → terminal 7 (USB)`; el Feature Unit 13 alimenta el mezclador de monitorización **[verificado con `lsusb -v`]**. El mute es el control de Mute del Feature Unit 10.

### Lo que no funciona: petición USB directa

Mandar `SET_CUR`/`GET_CUR` (`bmRequestType 0x21/0xa1`, `wValue 0x0100`, `wIndex unit<<8`) con `libusb` **falla con `Input/Output Error`** para cualquier unidad y canal **[verificado]**. `snd-usb-audio` es dueño de las interfaces de audio: `usbfs` rechaza las peticiones a una interfaz ajena y `claim_interface` devuelve `Busy`. Quitarle la interfaz al kernel cortaría el audio, así que se descartó.

### Lo que sí funciona: el control del kernel

`snd-usb-audio` expone ese mismo mute como el control `Mic Capture Switch` (interfaz `MIXER`) en `/dev/snd/controlC<N>`, y él traduce la escritura a la petición UAC. `src/audio.rs` lo manipula con dos `ioctl` directos (`SNDRV_CTL_IOCTL_ELEM_READ` `0xC4C85512` y `ELEM_WRITE` `0xC4C85513`, estructura `snd_ctl_elem_value` de 1224 bytes en 64 bits), sin `alsa-lib`:

1. Busca la tarjeta en `/sys/class/sound/card*` cuyo dispositivo USB padre es `0951:171d` (el número `N` cambia entre arranques).
2. Abre `/dev/snd/controlC<N>`.
3. Lee o escribe el elemento `Mic Capture Switch`. El valor es un *switch* de captura: `1` = el sonido pasa, `0` = silenciado.

Equivale a `amixer -c N cset name='Mic Capture Switch' off|on` **[verificado: silencia y PipeWire lo muestra como `MUTED`]**. Es independiente del LED y del sensor: este mute no apaga el RGB.

Uso:

```bash
quadcast-s mute          # estado
quadcast-s mute on       # silenciar
quadcast-s mute off      # reactivar
quadcast-s mute toggle
```

La web lo usa con el botón «Silenciar audio» a través de `GET/POST /api/audio`.

### Permisos

`/dev/snd/controlC*` ya es accesible para el usuario con sesión activa, así que **no hace falta ninguna regla udev** para el mute. La regla de `contrib/70-quadcast-s.rules` solo es necesaria para el RGB y el sensor (`171f`).

## Pendiente

- Probar con `quadcast-s color ff0000 --once` si el micrófono conserva el color sin reenviarlo.
- Comprobar si la interfaz 0 tenía controlador del kernel antes de usar la herramienta.
- Confirmar en `0951:171f` la consulta HID `0x58` y el byte de estado.
- Averiguar por qué fallaron las primeras pruebas de RGB.
- Capturar NGENUITY (Windows) para ver si hay más comandos de audio.
- REA no aportó nada hasta ahora: no tiene ningún motor de análisis instalado (Ghidra, Hopper, IDA o Kuna). Solo serviría para desensamblar NGENUITY.

## Cómo se capturó

```
sudo tcpdump -i usbmon1 -w ~/qs_rgb.pcap
```

El dispositivo `171f` era el número 8 del bus 1 (`lsusb`). La captura incluye el tráfico de todo el bus, y se descodifica con la cabecera `usbmon` de 64 bytes.
