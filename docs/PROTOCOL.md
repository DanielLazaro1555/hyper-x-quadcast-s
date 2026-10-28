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

- En `hidraw` (interfaz 1): un informe de 8 bytes `05 10 XX 00 00 00 00 00`. El byte `XX` alterna entre `00` y `01` con cada toque.
- El informe de eventos alterna `XX` con cada toque; señala una transición, pero no identifica por sí solo el estado absoluto.
- En `/dev/input/event*` ("Consumer Control"): `BTN_0` (código 256), pulsar y soltar.

Para obtener el estado actual sin esperar un toque, el servicio consulta el informe HID de función `0x07`, comando `0x58`, que reporta mute y patrón polar **[fuente externa; falta confirmarlo con este micrófono]**. La implementación lee el byte 13 para `0951:171f`, según el análisis publicado por [OpenHyperX](https://github.com/chase-irql/OpenHyperX/blob/main/quadcast/hyperx_quadcast.md). Si la consulta no responde, el estado queda desconocido; no se asume que `XX` sea un estado absoluto.

HyperX indica que el LED superior encendido significa micrófono activo y apagado significa mute.

La perilla de ganancia **no generó eventos** en 60 s de escucha. Es coherente con un control analógico por hardware **[hipótesis]**.

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
