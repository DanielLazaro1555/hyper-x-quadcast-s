# Windows

Estado: **compila y pasa las pruebas en Windows (GitHub Actions), pero nadie lo ha
probado todavía con un micrófono real.** Lo que sigue es lo que se espera que
funcione y lo que hay que verificar.

## Qué usa cada función

| Función | Linux | Windows |
|---|---|---|
| Color y brillo | USB directo (libusb) | USB directo (libusb incluida en el binario) |
| Sensor táctil | USB directo | USB directo (por verificar) |
| Mute de audio | Control ALSA `Mic Capture Switch` | WASAPI, `IAudioEndpointVolume` |
| Volumen de captura | Control ALSA | WASAPI |
| Ganancia fina, monitorización, auriculares, formatos | Controles ALSA | No disponible |
| Color guardado | `~/.config/quadcast-s/state.json` | `%APPDATA%\quadcast-s\state.json` |

## Driver USB (hace falta una vez)

El RGB y el sensor son un dispositivo HID (`0951:171f`). Windows lo reclama con su
driver HID, y libusb solo puede hablar con interfaces que tengan el driver **WinUSB**.

1. Descarga [Zadig](https://zadig.akeo.ie/).
2. Menú *Options > List All Devices*.
3. Elige el dispositivo `0951:171f` del QuadCast S. Atención: solo ese, **no** el `171d`
   (el audio), o el micrófono dejaría de sonar.
4. Selecciona *WinUSB* y pulsa *Replace Driver*.

Esto cambia el driver de la interfaz de luces; el audio sigue con el driver de Windows.
Para deshacerlo, desinstala el dispositivo en el Administrador de dispositivos y
desconéctalo y vuélvelo a conectar.

Si el micrófono tiene dos interfaces (0 y 1) y Zadig solo permite cambiar una, puede que
haga falta repetirlo para la otra. Es lo primero que hay que comprobar.

## Probar

Descarga `quadcast-s-Windows` de la última ejecución de *CI* en la pestaña *Actions*
del repositorio, descomprime y, en una terminal:

```
quadcast-s.exe info
quadcast-s.exe color ff0000
quadcast-s.exe mute toggle
quadcast-s.exe serve
```

Con `serve` la interfaz queda en <http://127.0.0.1:7878>. Si algo falla, el mensaje de
error es lo más útil para quien lo mantiene: abre un *issue* con él.

## Pendiente en Windows

- Probarlo con un micrófono real (todo lo anterior son hipótesis).
- Arranque automático (carpeta de inicio o tarea programada).
- Instalador MSI que incluya el driver, para no depender de Zadig.
