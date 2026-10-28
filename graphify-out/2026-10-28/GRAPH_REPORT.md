# Graph Report - hyper-x-quadcast-s  (2026-10-28)

## Corpus Check
- 21 files · ~10,565 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 2, .zip 1, .glb 1)

## Summary
- 229 nodes · 366 edges · 14 communities (10 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b2e33fe4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- main.ts
- device.rs
- Light
- protocol.rs
- ui/meter.ts
- package.json
- server.rs
- main.rs
- compilerOptions
- panel.ts
- Unknown mapping for mute report state byte
- quadcast-s
- Créditos de recursos
- Modelo 3D del QuadCast S

## God Nodes (most connected - your core abstractions)
1. `Light` - 13 edges
2. `Mic` - 11 edges
3. `mountMeter()` - 11 edges
4. `Shared` - 10 edges
5. `compilerOptions` - 10 edges
6. `lock()` - 9 edges
7. `run()` - 8 edges
8. `handle()` - 8 edges
9. `push()` - 8 edges
10. `serve()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Local web controller` --implements--> `DeviceStatus`  [INFERRED]
  README.md → web/src/api.ts
- `handle()` --references--> `Light`  [EXTRACTED]
  src/server.rs → src/light.rs
- `serve()` --references--> `Light`  [EXTRACTED]
  src/server.rs → src/light.rs
- `poll()` --calls--> `getStatus()`  [EXTRACTED]
  web/src/main.ts → web/src/api.ts
- `push()` --calls--> `setLight()`  [EXTRACTED]
  web/src/main.ts → web/src/api.ts

## Import Cycles
- None detected.

## Communities (14 total, 4 thin omitted)

### Community 0 - "main.ts"
Cohesion: 0.08
Nodes (36): Local web controller, three, DeviceStatus, getStatus(), parse(), setLight(), currentRgb, describe() (+28 more)

### Community 1 - "device.rs"
Cohesion: 0.10
Nodes (24): DeviceHandle, GlobalContext, EP_IN, FEATURE_REPORT_ID, info(), INTERFACES, Mic, not_found() (+16 more)

### Community 2 - "Light"
Cohesion: 0.13
Nodes (22): Condvar, JoinHandle, Mutex, MutexGuard, FRAME_INTERVAL, Light, lock(), MUTE_STATUS_INTERVAL (+14 more)

### Community 3 - "protocol.rs"
Cohesion: 0.13
Nodes (15): COLOR_CODE, color_packet(), DISPLAY_CODE, green_matches_capture(), HEADER_CODE, header_matches_capture(), header_packet(), mute_event_value() (+7 more)

### Community 4 - "ui/meter.ts"
Cohesion: 0.23
Nodes (17): describeError(), InputInfo, listInputs(), MeterHandle, MeterReading, MIN_DB, onlyBoolean(), preferredInput() (+9 more)

### Community 5 - "package.json"
Cohesion: 0.11
Nodes (17): @types/three, typescript, vite, dependencies, three, devDependencies, @types/three, typescript (+9 more)

### Community 6 - "server.rs"
Cohesion: 0.18
Nodes (16): Request, ALLOWED_HOSTS, ALLOWED_ORIGINS, error(), handle(), header(), LightRequest, MAX_BODY (+8 more)

### Community 7 - "main.rs"
Cohesion: 0.29
Nodes (15): ExitCode, ColorOptions, main(), parse_color_options(), Arc, AtomicBool, Option, Result (+7 more)

### Community 8 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, lib, module, moduleResolution, noUnusedLocals, noUnusedParameters, skipLibCheck, strict (+3 more)

### Community 9 - "panel.ts"
Cohesion: 0.26
Nodes (12): NEUTRAL_CALIBRATION, Store, el(), hexToHsv(), Hsv, hsvToHex(), mountPanel(), PRESET_NAMES (+4 more)

## Knowledge Gaps
- **60 isolated node(s):** `quadcast-s`, `VID`, `PID`, `REQUEST_TYPE_OUT`, `REQUEST_SET_REPORT` (+55 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 95 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Light` connect `Light` to `server.rs`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `three` connect `main.ts` to `package.json`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **What connects `quadcast-s`, `VID`, `PID` to the rest of the system?**
  _60 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07575757575757576 - nodes in this community are weakly interconnected._
- **Should `device.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.1028225806451613 - nodes in this community are weakly interconnected._
- **Should `Light` be split into smaller, more focused modules?**
  _Cohesion score 0.13105413105413105 - nodes in this community are weakly interconnected._
- **Should `protocol.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.1286549707602339 - nodes in this community are weakly interconnected._