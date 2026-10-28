# Graph Report - hyper-x-quadcast-s  (2026-10-28)

## Corpus Check
- 24 files · ~13,571 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 302 nodes · 508 edges · 15 communities (13 shown, 2 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Cliente web y estado
- Acceso USB (device.rs)
- Hilo de luz y lectura de color
- Protocolo USB documentado
- Interfaz web y documentación
- Estado, color y calibración
- Mute de audio por ALSA
- API local y seguridad
- Medidor de audio
- Dependencias web
- Línea de comandos
- Configuración TypeScript
- Créditos de recursos
- Paquete Cargo
- README principal

## God Nodes (most connected - your core abstractions)
1. `Light` - 14 edges
2. `Mic` - 11 edges
3. `Shared` - 11 edges
4. `mountMeter()` - 11 edges
5. `lock()` - 10 edges
6. `compilerOptions` - 10 edges
7. `run()` - 9 edges
8. `handle()` - 9 edges
9. `push()` - 9 edges
10. `ioctl()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Sincronización de color web-micrófono` --references--> `UiColor`  [INFERRED]
  README.md → src/light.rs
- `Modelo 3D` --semantically_similar_to--> `Crédito del recurso 3D`  [INFERRED] [semantically similar]
  docs/ASSET-CREDITS.md → web/public/models/README.md
- `Interfaz web (color, brillo, mute, modelo, tema)` --references--> `Icono SVG: cápsula con rejilla y degradado RGB`  [EXTRACTED]
  README.md → web/public/favicon.svg
- `Icono original (GPL-2.0-or-later)` --references--> `Icono SVG: cápsula con rejilla y degradado RGB`  [EXTRACTED]
  docs/ASSET-CREDITS.md → web/public/favicon.svg
- `Sincronización de color web-micrófono` --references--> `Lectura del color: último paquete escrito, se consume al leer`  [EXTRACTED]
  README.md → docs/PROTOCOL.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Cómo la web se entera del estado del micrófono** — docs_protocol_mute_event, docs_protocol_color_readback, readme_color_sync [INFERRED 0.75]

## Communities (15 total, 2 thin omitted)

### Community 0 - "Cliente web y estado"
Cohesion: 0.07
Nodes (41): DeviceStatus, getAudioMuted(), getStatus(), parse(), setAudioMuted(), setLight(), applyRemote(), applyVariant() (+33 more)

### Community 1 - "Acceso USB (device.rs)"
Cohesion: 0.10
Nodes (24): DeviceHandle, GlobalContext, EP_IN, info(), INTERFACES, Mic, not_found(), PID (+16 more)

### Community 2 - "Hilo de luz y lectura de color"
Cohesion: 0.12
Nodes (25): Condvar, Lectura del color: último paquete escrito, se consume al leer, Consulta 0x58 sin respuesta en este micrófono, JoinHandle, Mutex, MutexGuard, Sincronización de color web-micrófono, FRAME_INTERVAL (+17 more)

### Community 3 - "Protocolo USB documentado"
Cohesion: 0.09
Nodes (23): Mute de audio por el control ALSA Mic Capture Switch, Dos dispositivos USB: 171f (RGB y sensor) y 171d (audio), La petición USB directa al Feature Unit falla con EIO, Feature Unit 10: mute de captura (UAC 1.0), Evento HID 05 10 XX: 01 activo, 00 silenciado, Paquetes RGB: cabecera 04 f2 y color 81 RR GG BB, Regla udev para el RGB y el sensor, COLOR_CODE (+15 more)

### Community 4 - "Interfaz web y documentación"
Cohesion: 0.09
Nodes (18): Icono original (GPL-2.0-or-later), Medidor de audio en el navegador, Calibración de colores (gamma y ganancias), Modelo 3D negro y blanco, Modo claro y oscuro, Interfaz web (color, brillo, mute, modelo, tema), three, Tarjeta de controles sobre el 3D (+10 more)

### Community 5 - "Estado, color y calibración"
Cohesion: 0.13
Nodes (22): displayRgb(), applyBrightness(), Calibration, channels(), correctColor(), createStore(), LightState, Listener (+14 more)

### Community 6 - "Mute de audio por ALSA"
Cohesion: 0.19
Nodes (21): c_long, c_ulong, File, AUDIO_PID, CONTROL_NAME, element(), ElemId, ElemValue (+13 more)

### Community 7 - "API local y seguridad"
Cohesion: 0.18
Nodes (19): Seguridad del servicio local, Request, ALLOWED_HOSTS, ALLOWED_ORIGINS, audio_reply(), AudioRequest, error(), handle() (+11 more)

### Community 8 - "Medidor de audio"
Cohesion: 0.23
Nodes (17): describeError(), InputInfo, listInputs(), MeterHandle, MeterReading, MIN_DB, onlyBoolean(), preferredInput() (+9 more)

### Community 9 - "Dependencias web"
Cohesion: 0.11
Nodes (17): @types/three, typescript, vite, dependencies, three, devDependencies, @types/three, typescript (+9 more)

### Community 10 - "Línea de comandos"
Cohesion: 0.29
Nodes (16): ExitCode, ColorOptions, main(), parse_color_options(), Arc, AtomicBool, Option, Result (+8 more)

### Community 11 - "Configuración TypeScript"
Cohesion: 0.17
Nodes (11): compilerOptions, lib, module, moduleResolution, noUnusedLocals, noUnusedParameters, skipLibCheck, strict (+3 more)

### Community 12 - "Créditos de recursos"
Cohesion: 0.33
Nodes (4): Créditos de recursos, Modelo 3D, Crédito del recurso 3D, Modelo 3D del QuadCast S

## Knowledge Gaps
- **80 isolated node(s):** `quadcast-s`, `VID`, `AUDIO_PID`, `CONTROL_NAME`, `SNDRV_CTL_ELEM_IFACE_MIXER` (+75 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 114 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Interfaz web (color, brillo, mute, modelo, tema)` connect `Interfaz web y documentación` to `API local y seguridad`?**
  _High betweenness centrality (0.389) - this node is a cross-community bridge._
- **Why does `Modelo 3D negro y blanco` connect `Interfaz web y documentación` to `Cliente web y estado`?**
  _High betweenness centrality (0.252) - this node is a cross-community bridge._
- **Why does `Light` connect `Hilo de luz y lectura de color` to `API local y seguridad`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **What connects `quadcast-s`, `VID`, `AUDIO_PID` to the rest of the system?**
  _80 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Cliente web y estado` be split into smaller, more focused modules?**
  _Cohesion score 0.07474747474747474 - nodes in this community are weakly interconnected._
- **Should `Acceso USB (device.rs)` be split into smaller, more focused modules?**
  _Cohesion score 0.1028225806451613 - nodes in this community are weakly interconnected._
- **Should `Hilo de luz y lectura de color` be split into smaller, more focused modules?**
  _Cohesion score 0.12043010752688173 - nodes in this community are weakly interconnected._