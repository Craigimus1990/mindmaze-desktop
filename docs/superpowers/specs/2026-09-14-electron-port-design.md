# MindMaze — Electron Port Design Spec
_2026-09-14_

## Overview

MindMaze moves from an Android tablet app to a cross-platform Electron desktop app, so
family members who use iPhones — and therefore cannot install the Android build — can play
on a Mac or Windows laptop.

This is the same manoeuvre as the 2026-07-24 tablet pivot, one platform further out: a
UI-shell replacement, not a rewrite. The difference is that the shell now lands on a runtime
with no JVM, so `:game-engine` is translated to TypeScript rather than reused as a binary.

The game rules do not change. Not one rule, threshold, or message.

---

## Scope

**In scope:** a TypeScript port of `:game-engine`; a TypeScript port of the UI state layer;
canvas ports of the room and minimap renderers; six React screens; JSON-file persistence;
background music; mouse and keyboard input; the ported test suites; packaging config for
macOS and Windows; a CI workflow to build the macOS artifact.

**Out of scope:** voice control (dropped — see Decisions); touch gestures; multiplayer;
online sync; code signing; any gameplay change; any change to `mindmaze/`.

The Android project is **read-only for this port.** No file under `mindmaze/` is modified.

---

## Decisions

Four decisions were settled before design and drive everything below.

### The engine is ported to TypeScript

Rejected: compiling `:game-engine` via Kotlin/JS, and bundling a JVM sidecar.

The target audience is family members installing a game on a laptop. A JVM sidecar makes the
download ~50MB heavier and adds a runtime dependency that can fail on a machine nobody
technical is sitting at. Kotlin/JS avoids translation but welds Gradle and the Kotlin
toolchain into the Electron build, so the app cannot be built without them.

A TypeScript port costs the most upfront and is the only option that ships a normal desktop
app with nothing to install. Correctness is protected by porting the existing test suite
(see Testing), which is what makes the translation verifiable rather than hopeful.

### Voice control is dropped

`voice/` (183 lines) existed because the original target was a child in a back seat who could
not reliably tap a screen. At a desk there is a mouse and a keyboard. The Web Speech API
would also route audio through Google's servers on desktop Chromium, requiring a network
connection for a game explicitly designed to work offline.

`VoiceCommandHandler` and `SpeechRecognizerController` are not ported. `PlayerAction` keeps
its full shape, so a future voice layer has an unchanged target to aim at.

### Structure mirrors the Kotlin source

Directory layout, file names, class names, and doc comments are carried across rather than
restructured into idiomatic web conventions.

This buys reviewability: `MazeGenerator.ts` sits beside `MazeGenerator.kt` with matching
function names, so the two can be diffed by eye and a ported test failure points at a
specific line. It also gives future fixes on either platform an obvious counterpart location.

### Rendering is a faithful canvas port

`android.graphics.Canvas` maps closely onto `CanvasRenderingContext2D`. The alternative —
rebuilding rooms as DOM and CSS layers — would require re-deriving the cover-crop projection
and tap hit-testing that `RoomGeometry` documents at length, which is precisely how a port
reintroduces a bug that was already fixed.

---

## Architecture

```
mindmaze_electron/
├── package.json, tsconfig.json, vite.config.ts, electron-builder.yml
├── electron/
│   ├── main.ts              # window, lifecycle, userData file IO
│   └── preload.ts           # contextBridge: persistence API only
├── src/
│   ├── engine/              # port of :game-engine — pure, no DOM
│   │   ├── model/           # GameState, Maze, Room, Direction, …
│   │   └── engine/          # GameEngine, MazeGenerator, MazeSolver,
│   │                        #   ScoreCalculator, TriviaRepository, rng
│   ├── ui/                  # UiState, PlayerAction, UiStateReducer
│   ├── rendering/           # RoomRenderer, MinimapRenderer, RoomGeometry,
│   │                        #   RoomTreasure, PlacementMap, CharacterCatalog,
│   │                        #   ImageAssetManager, ExitLayout
│   ├── persistence/         # GameStateStore, SettingsStore, QuestionBank,
│   │                        #   QuestionStore, SavedGame
│   ├── react/               # thin shell: six screens + canvas host
│   └── assets/              # 133 images, music, questions.json, placements
└── tests/                   # ported Vitest suites
```

### Process split

The renderer process holds the entire game: engine, state machine, canvas, audio. The main
process creates the window and reads/writes four JSON files under
`app.getPath('userData')`. No game logic lives in main, so **no IPC occurs in the gameplay
loop** — a click resolves entirely in the renderer.

### Security

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The preload exposes a
narrow API over `contextBridge`:

```ts
window.mindmaze = {
  loadActive(),  saveActive(game),  clearActive(),
  loadSaved(),   saveSaved(game),   clearSaved(),
  loadSettings(), saveSettings(s),
  loadCustomQuestions(), saveCustomQuestions(q),
}
```

The renderer never imports `fs` or `path`. Main validates that every write target resolves
inside `userData` before writing. This costs nothing here because persistence is four small
files, and it keeps the app off the well-known Electron footguns.

### Dependency direction

One-way, identical to Android: `react → ui → engine → model`, with `rendering` depending only
on `model` and the canvas context. No UI type is visible to the engine. The engine never
learns the UI exists.

### Stack

Electron, Vite, TypeScript (strict), React, Vitest, electron-builder. Vite is chosen for its
dev-server reload speed, which matters most during rendering calibration — the one phase
where the feedback loop is visual rather than a test run.

---

## The engine port

`:game-engine` is 1,413 lines across 21 model files and 6 engine files, with no Android
imports. Translation is mechanical:

| Kotlin | TypeScript |
|---|---|
| `data class` | `interface` + spread-based copy helper |
| `sealed class` (`ExitType`, `Pickup`, `TreasureLock`, `GameEvent`) | discriminated union on a `type` field |
| `enum class` (`Direction`, `Topic`, `Difficulty`, `Complexity`, `DoorState`) | string-literal union |
| `Map<Int, Room>` | `Map<number, Room>` |
| `kotlinx.serialization` | `JSON.parse` / `JSON.stringify` |

Discriminated unions are a mild upgrade: TypeScript narrows them exhaustively in a `switch`,
so a missed variant is a compile error rather than a silent fallthrough.

`Difficulty` carries an `active: Boolean` property (only `KINDERGARTEN` and `ADULT` are
true). It becomes a string-literal union plus a lookup table, preserving both the names and
the active flags.

### Randomness

`MazeGenerator.generate(complexity, random: Random = Random.Default)` takes an injectable
RNG, and the maze tests depend on that for determinism. `Math.random()` cannot be seeded, so
a naive port would silently void every determinism guarantee those tests provide: they would
still pass, having stopped checking what they were written to check.

`src/engine/engine/rng.ts` provides a seeded PRNG (mulberry32) behind the interface this code
actually uses — `nextInt(bound)` and `shuffled(list)` (Fisher-Yates). Call sites keep their
injected-RNG shape. Tests pass explicit seeds; production passes a time-seeded instance.

**Limit, stated explicitly:** identical seeds do *not* reproduce identical mazes across
Kotlin and TypeScript, because the underlying bit generators differ. Determinism holds within
the TypeScript port — same seed, same maze, every run — which is what the tests require.
Cross-language maze reproduction would mean reimplementing Kotlin's `Random` bit-for-bit and
is not a goal.

### Preserved quirk

`GameEngine` holds three mutable fields outside `GameState`, and therefore outside the save
file: `pendingTriviaDirection`, `pendingWindlassRoom`, `windlassExplained`. A game saved
mid-trivia reloads having forgotten the pending question.

This behaviour is **preserved exactly**. Matching the original is the job; a behaviour change
hidden inside a port is how a port loses trust. It is noted here as a candidate follow-up,
not fixed in passing.

### Port order

`model/` first (no dependencies), then `rng`, then `MazeGenerator` and `MazeSolver` (the
algorithmic core carrying the most test coverage), then `ScoreCalculator` and
`TriviaRepository`, and `GameEngine` last since it orchestrates the rest. Each lands green
before the next begins.

---

## The UI state layer

`UiState` (6 variants), `PlayerAction` (10 variants), and `UiStateReducer` (175 lines) contain
no Compose types. They are a pure state machine and port directly, sealed interfaces becoming
discriminated unions and `reduce()` keeping its signature.

React is consequently thin: one `useReducer` holding `UiState`, and screens that render it
and dispatch `PlayerAction`s. The invariant that made the Android app testable — every player
intent becomes a `PlayerAction`, so input paths cannot diverge — carries over and now spans
mouse and keyboard.

Screens ported: `MenuScreen`, `GameScreen`, `TriviaDialog`, `ResultsScreen`, `MessageDialog`,
`QuestionsScreen`, plus `MenuBackdrop`. Compose layout becomes CSS; Compose's parchment
styling is reproduced with the same asset tiles (`ui_panel_tile`, `ui_answer_plate`,
`ui_corner_flourish`).

### Input

- **Mouse:** click doors, pickups, the windlass, and answer plates — the same hit regions the
  Android build tapped.
- **Keyboard:** arrow keys / WASD for movement and door attempts, `A`–`D` for answers, `Esc`
  to dismiss a message, `H` for hint, `K` for key.

Keyboard is additive: it dispatches the same `PlayerAction`s, so it cannot diverge from mouse
behaviour.

---

## Rendering

`RoomRenderer` (304 lines) and `MinimapRenderer` (218 lines) translate to
`CanvasRenderingContext2D`:

| Android | Canvas 2D |
|---|---|
| `drawBitmap(src, srcRect, dstRect, paint)` | `drawImage(img, sx,sy,sw,sh, dx,dy,dw,dh)` |
| `Paint.textSize` / `textAlign` / `color` | `font` / `textAlign` / `fillStyle` |
| `setShadowLayer(r, dx, dy, c)` | `shadowBlur` / `shadowOffsetX/Y` / `shadowColor` |
| `Paint.alpha = 110` | `globalAlpha = 0.43` |

Skia and Chromium measure text slightly differently, so HUD metrics may need nudging. This is
cosmetic and visible immediately on launch.

### RoomGeometry ports verbatim

`RoomGeometry` (142 lines) is carried across **unchanged** — constants, projection math, and
its full doc comment. That comment records that door geometry was once hardcoded in three
places that drifted apart, leaving labels floating above and inboard of the doors they
described, "and nothing failed a test because nothing tested it." `projectX`/`projectY` encode
the cover-crop mapping that fixed it.

Re-deriving that math by hand is exactly how this port would reintroduce a solved bug.
`RoomGeometryTest`, `ExitLayoutTest`, and `PlacementMapTest` come across with it.

**Hit-testing uses the same projection as drawing.** A door's clickable region is computed
through `projectX`/`projectY`, so it cannot drift from its painted position — the failure
mode `RoomGeometry` was written to prevent.

### Canvas sizing

The canvas has a fixed internal resolution scaled by CSS. Geometry stays stable at any window
size, HiDPI is handled by multiplying the backing store by `devicePixelRatio`, and the
authored `SPEC_ASPECT` continues to govern door placement. The window is resizable with a
minimum size and a locked landscape-ish aspect.

---

## Assets

All 133 images (125 `.webp`, 8 `.png`, 22MB) and `music_market_day.mp3` are natively
supported by Chromium and copy across without conversion. `character_placements.json` (76KB)
and `questions.json` (124 questions) are read directly.

Android's `R.drawable.<name>` lookup becomes a Vite glob import map keyed by the same names,
so `CharacterCatalog` (143 lines) and `ImageAssetManager` (125 lines) keep their naming
conventions and their tests.

### The one deliberate divergence

Android decoded drawables synchronously. The web's `Image` loads asynchronously, and a room
drawn before its backdrop arrives flashes empty.

`ImageAssetManager` therefore gains a preload step: it loads into a cache and resolves a
promise before first paint, with a loading state while a game starts. This is the only place
the port intentionally departs from the Android structure, because the platform genuinely
differs.

### Audio

An `<audio>` element gated on the existing `musicEnabled` setting. Chromium blocks autoplay
until a user gesture, so playback begins on the first click; starting it at menu load would
fail silently.

---

## Persistence

Four JSON files under `app.getPath('userData')`, reached through the preload API:

| File | Contents |
|---|---|
| `game_state.json` | active `SavedGame` |
| `saved_game.json` | cross-session `SavedGame` |
| `settings.json` | difficulty, complexity, topics, `music_enabled` |
| `custom_questions.json` | authored questions + deleted ids |

`GameStateStore`, `SettingsStore`, `QuestionBank`, and `QuestionStore` keep their method
shapes; only the storage call underneath changes. `SettingsStore` defaults are preserved
(`KINDERGARTEN`, `SIMPLE`, all topics), so a first launch on a laptop behaves like a first
launch on the tablet. `musicEnabled` stays out of `GameSettings` for the reason its Kotlin
doc comment gives: it is a UI preference and has no business in the engine's save format.

The `SavedGame` envelope (`state` + `entryDirection`) ports as-is, including the legacy
fallback that reads a bare `GameState` written before `entryDirection` existed. That fallback
costs three lines and prevents a stranded save.

### Save-file compatibility is a non-goal

`kotlinx.serialization` writes sealed classes with a `"type"` discriminator whose exact shape
the round-trip test does not pin — it proves only that Kotlin reads its own output. The
TypeScript port therefore defines its own on-disk shape and does **not** promise to read a
file produced by the Android app.

Nothing is lost: the two apps run on different devices with no transfer path between them,
and no family member has an existing Android save. Claiming compatibility would mean
verifying byte-level agreement against real Kotlin output for every sealed variant, which is
substantial work for a scenario that does not arise.

---

## Testing

Headless Vitest covers everything that is pure logic. Ported suites:

**Engine (10 files)** — `MazeGeneratorTest`, `MazeNavigabilityTest`, `MazeStructureTest`,
`MazeSolverTest`, `GameEngineTest`, `ScoreCalculatorTest`, `TreasureLockTest`,
`WindlassTest`, `TriviaRepositoryTest`, `GameStateSerializationTest`.

`GameStateSerializationTest` is ported in adapted rather than identical form: it round-trips
`GameState` through the port's own JSON shape, pinning *this* app's save format. It does not
assert agreement with Kotlin's output, consistent with save-file compatibility being a
non-goal.

The maze suites matter most. They assert that every generated maze is fully connected and the
treasure genuinely reachable. An unsolvable maze is the worst bug this app can ship, because
a child hits a dead end and the game is simply broken with no feedback explaining why.

**App-layer** — `UiStateReducerTest`, `RoomGeometryTest`, `ExitLayoutTest`, `PlacementMapTest`,
`CharacterCatalogTest`, `QuestionBankTest`, `CustomQuestionMergeTest`, `SettingsStoreTest`,
`GameStateStoreTest`, `RoomTreasureTest`.

**New** — `ImageAssetManagerTest` is rewritten rather than ported, because preloading is
behaviour the Android version did not have. It covers cache hits, concurrent requests for one
image, and a failed load surfacing rather than hanging the start of a game.

Not ported: Robolectric-dependent asset tests (`DrawableFiles`, `Png`, `ThemedAssetTest`,
`UiAssetTest`, `MusicAssetTest`, `BackdropAssetTest`, `MenuBackdropTest`,
`RoomAssetCalibrationTest`, `OverlayLabelTest`) and the two voice suites. The asset-existence
checks are replaced by a single build-time script that verifies every name the catalogs
reference resolves to a file in `src/assets/`.

### Method

The tests already exist and already encode correct behaviour, so the port is TDD in its
truest form: port a test file, watch it fail, port implementation until it passes. **The
engine is done when all 10 engine suites are green** — a real completion criterion rather
than a judgment call.

Pixel-level rendering is not unit-tested, matching the Android project's deferral of Compose
UI tests. Rendering is verified by running the app and screenshotting rooms, which for door
alignment is more honest than an assertion.

---

## Distribution

electron-builder targets macOS (`.dmg`, x64 + arm64) and Windows (NSIS `.exe`). Linux
(AppImage) is included because it is nearly free and is the development machine.

### The macOS build constraint

**A macOS `.dmg` cannot be produced on the Linux development machine.** macOS packaging
requires macOS. Two ways round it:

1. **GitHub Actions** (recommended) — free macOS runners build the `.dmg` on a tag push, and
   the Releases page doubles as the distribution channel for family. The workflow is written
   as part of this port.
2. **Build on any Mac** — `npm run dist:mac`, with config ready to go.

### Signing

Both platforms ship unsigned. macOS requires a right-click → Open on first launch; Windows
shows a SmartScreen warning to click through once. Signing costs $99/yr (Apple) plus a
Windows certificate, which is hard to justify for family distribution. The one-time
click-through is documented in the README instead.

---

## Sequencing

1. Scaffold — Vite, Electron, TypeScript, Vitest, a window that opens
2. Engine — `model/`, `rng`, generator/solver, scoring, trivia, `GameEngine` (10 suites green)
3. State layer — `UiState`, `PlayerAction`, `UiStateReducer` (suite green)
4. Assets + rendering — import map, `ImageAssetManager` preload, `RoomGeometry`, renderers
5. React screens — six screens, mouse and keyboard input
6. Persistence — preload API, four stores
7. Packaging — electron-builder config, CI workflow, README

The engine is the largest chunk. Rendering calibration is the least predictable, being the
phase where "correct" means looking right rather than passing.

---

## Risks

| Risk | Mitigation |
|---|---|
| Translation drift in 1,413 lines of engine | 10 ported test suites; mirrored structure makes Kotlin/TS diffable by eye |
| Door hit regions drift from painted doors | `RoomGeometry` ported verbatim; hit-test and draw share one projection |
| Text metrics differ (Skia vs Chromium) | Cosmetic, visible on first launch, nudged during calibration |
| macOS build unverifiable locally | CI on macOS runners; flagged before work starts, not at delivery |
| Asset name mismatch after import-map change | Build-time script verifies every catalog name resolves |

## Success criteria

- All 10 engine suites and all ported app-layer suites green
- A full game is playable start to treasure with mouse alone, and with keyboard alone
- Rooms, doors, pickups, and minimap render recognisably as the Android build
- Doors are clickable exactly where they are drawn, at more than one window size
- Settings and an in-progress game survive a quit and relaunch
- A Windows artifact and a Linux artifact build locally; a macOS artifact builds in CI
