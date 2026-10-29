# Graph Report - hyper-x-quadcast-s  (2026-10-28)

## Corpus Check
- 25 files · ~19,259 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 419 nodes · 722 edges · 27 communities (23 shown, 4 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Protocolo y documentación
- Instalación y audio Linux
- Acceso USB (device.rs)
- Hilo de luz y sensor
- API local y web incrustada
- Escena 3D y variantes
- Estado, color y calibración
- Cliente web y tipos de la API
- Audio en Windows (WASAPI)
- Protocolo RGB (protocol.rs)
- Medidor de audio
- Dependencias web
- Línea de comandos
- Escenario 3D (stage.ts)
- Configuración TypeScript
- Color guardado en disco
- Sondeo de estado en la web
- Tipos del audio (mod.rs)
- Materiales y luz del 3D
- Créditos de recursos
- Pestañas y dispositivo
- Sincronización de color
- Icono SVG
- Nodo suelto 23
- Nodo suelto 24
- Nodo suelto 25
- Nodo suelto 26

## God Nodes (most connected - your core abstractions)
1. `Light` - 14 edges
2. `Mic` - 11 edges
3. `Shared` - 11 edges
4. `mountMeter()` - 11 edges
5. `compilerOptions` - 10 edges
6. `ioctl()` - 10 edges
7. `win()` - 10 edges
8. `endpoint_volume()` - 10 edges
9. `lock()` - 10 edges
10. `open_control()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Modelo 3D` --semantically_similar_to--> `Crédito del recurso 3D`  [INFERRED] [semantically similar]
  docs/ASSET-CREDITS.md → web/public/models/README.md
- `Driver WinUSB instalado con Zadig` --semantically_similar_to--> `Desconexión de usbhid mientras se usa el micrófono`  [INFERRED] [semantically similar]
  docs/WINDOWS.md → README.md
- `Icono original (GPL-2.0-or-later)` --references--> `Icono SVG: cápsula con rejilla y degradado RGB`  [EXTRACTED]
  docs/ASSET-CREDITS.md → web/public/favicon.svg
- `Lectura del color por GET_REPORT (consume el dato)` --shares_data_with--> `API local 127.0.0.1:7878`  [INFERRED]
  docs/PROTOCOL.md → README.md
- `Mute de audio por el control ALSA Mic Capture Switch` --shares_data_with--> `API local 127.0.0.1:7878`  [INFERRED]
  docs/PROTOCOL.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Flujo de Release: linux, windows y publish** — github_workflows_release_job_linux, github_workflows_release_job_windows, github_workflows_release_job_publish [EXTRACTED 1.00]
- **Controles de audio por ALSA** — docs_protocol_mute_alsa, docs_protocol_mezclador_alsa, docs_protocol_peticion_usb_directa [INFERRED 0.85]
- **Envío y lectura del color RGB** — docs_protocol_rgb_set_report, docs_protocol_fotograma, docs_protocol_leer_color [INFERRED 0.85]

## Communities (27 total, 4 thin omitted)

### Community 0 - "Protocolo y documentación"
Cohesion: 0.06
Nodes (44): Protocolo USB del QuadCast S, Dispositivos USB 0951:171d (audio) y 0951:171f (HID), Etiquetas de certeza: verificado, fuente, hipótesis, Formato de audio: 16 bits, 2 canales, hasta 48 kHz, Fotograma: cabecera y paquete de datos 81 RR GG BB, Lectura del color por GET_REPORT (consume el dato), Controles del mezclador ALSA, Mute de audio por el control ALSA Mic Capture Switch (+36 more)

### Community 1 - "Instalación y audio Linux"
Cohesion: 0.12
Nodes (34): c_long, c_ulong, File, Path, AUDIO_PID, CONTROL_NAME, CONTROLS, ControlSpec (+26 more)

### Community 2 - "Acceso USB (device.rs)"
Cohesion: 0.10
Nodes (24): DeviceHandle, GlobalContext, Packet, EP_IN, info(), INTERFACES, Mic, not_found() (+16 more)

### Community 3 - "Hilo de luz y sensor"
Cohesion: 0.14
Nodes (22): Condvar, JoinHandle, Mutex, MutexGuard, FRAME_INTERVAL, Light, lock(), RETRY_INTERVAL (+14 more)

### Community 4 - "API local y web incrustada"
Cohesion: 0.13
Nodes (25): Dir, Request, ALLOWED_HOSTS, ALLOWED_ORIGINS, audio_reply(), AudioRequest, error(), handle() (+17 more)

### Community 5 - "Escena 3D y variantes"
Cohesion: 0.07
Nodes (23): audioButton, currentRgb, currentVariant, device, Finish, FOAM, importedGlow, importedLedMaterials (+15 more)

### Community 6 - "Estado, color y calibración"
Cohesion: 0.13
Nodes (22): applyBrightness(), Calibration, channels(), correctColor(), createStore(), LightState, Listener, loadCalibration() (+14 more)

### Community 7 - "Cliente web y tipos de la API"
Cohesion: 0.18
Nodes (20): DeviceInfo, DeviceStatus, MixerControl, setAudioMuted(), setMixer(), StreamFormat, UsbDevice, card() (+12 more)

### Community 8 - "Audio en Windows (WASAPI)"
Cohesion: 0.25
Nodes (19): IAudioEndpointVolume, IMMDevice, AUDIO_PID, endpoint_volume(), find_endpoint(), info(), is_muted(), mixer() (+11 more)

### Community 9 - "Protocolo RGB (protocol.rs)"
Cohesion: 0.13
Nodes (16): COLOR_CODE, color_packet(), DISPLAY_CODE, green_matches_capture(), HEADER_CODE, header_matches_capture(), header_packet(), mute_event_value() (+8 more)

### Community 10 - "Medidor de audio"
Cohesion: 0.23
Nodes (17): describeError(), InputInfo, listInputs(), MeterHandle, MeterReading, MIN_DB, onlyBoolean(), quadcastInputs() (+9 more)

### Community 11 - "Dependencias web"
Cohesion: 0.11
Nodes (17): @types/three, typescript, vite, dependencies, three, devDependencies, @types/three, typescript (+9 more)

### Community 12 - "Línea de comandos"
Cohesion: 0.29
Nodes (16): ExitCode, ColorOptions, main(), parse_color_options(), Arc, AtomicBool, Option, Result (+8 more)

### Community 13 - "Escenario 3D (stage.ts)"
Cohesion: 0.15
Nodes (8): three, createStage(), Look, PALETTE, Stage, listeners, query, Theme

### Community 14 - "Configuración TypeScript"
Cohesion: 0.17
Nodes (11): compilerOptions, lib, module, moduleResolution, noUnusedLocals, noUnusedParameters, skipLibCheck, strict (+3 more)

### Community 15 - "Color guardado en disco"
Cohesion: 0.53
Nodes (8): PathBuf, config_dir(), guarda_y_recupera(), load(), path(), Option, save(), Saved

### Community 16 - "Sondeo de estado en la web"
Cohesion: 0.22
Nodes (9): getAudioMuted(), getStatus(), parse(), setLight(), describe(), poll(), pollAudio(), renderAudioButton() (+1 more)

### Community 17 - "Tipos del audio (mod.rs)"
Cohesion: 0.50
Nodes (7): AudioInfo, ControlState, Option, String, Vec, StreamFormat, UsbDevice

### Community 18 - "Materiales y luz del 3D"
Cohesion: 0.38
Nodes (7): applyVariant(), makePart(), push(), setAudioLevel(), setImportedLight(), setMuteState(), uiKey()

### Community 19 - "Créditos de recursos"
Cohesion: 0.33
Nodes (4): Créditos de recursos, Modelo 3D, Crédito del recurso 3D, Modelo 3D del QuadCast S

### Community 20 - "Pestañas y dispositivo"
Cohesion: 0.50
Nodes (4): getDevice(), pollDevice(), required(), showTab()

### Community 21 - "Sincronización de color"
Cohesion: 0.50
Nodes (4): applyRemote(), fromDeviceColor(), hexToRgb(), syncColor()

### Community 22 - "Icono SVG"
Cohesion: 0.67
Nodes (3): Icono original (GPL-2.0-or-later), Icono SVG: cápsula con rejilla y degradado RGB, Degradado RGB rojo-violeta-azul

## Knowledge Gaps
- **95 isolated node(s):** `Listener`, `Hsv`, `lib`, `module`, `moduleResolution` (+90 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 143 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `three` connect `Escenario 3D (stage.ts)` to `Dependencias web`, `Escena 3D y variantes`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `Light` connect `Hilo de luz y sensor` to `API local y web incrustada`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `mountMeter()` connect `Medidor de audio` to `Escena 3D y variantes`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `Listener`, `Hsv`, `lib` to the rest of the system?**
  _95 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Protocolo y documentación` be split into smaller, more focused modules?**
  _Cohesion score 0.06025369978858351 - nodes in this community are weakly interconnected._
- **Should `Instalación y audio Linux` be split into smaller, more focused modules?**
  _Cohesion score 0.11861861861861862 - nodes in this community are weakly interconnected._
- **Should `Acceso USB (device.rs)` be split into smaller, more focused modules?**
  _Cohesion score 0.1028225806451613 - nodes in this community are weakly interconnected._