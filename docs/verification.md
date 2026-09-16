# MindMaze Electron port — verification

_2026-09-15._

This records what was actually checked, how, and what was not. Claims here are things that were
run and observed, not things inferred from the code.

## Test suite

`npm test` — **314 passing** across 28 files. `npm run typecheck` — exit 0. `npm run build` — exit 0.

All **10 Kotlin engine suites** are green in TypeScript:

| Suite | Cases |
|---|---|
| `GameEngineTest` | 18 |
| `WindlassTest` | 11 |
| `TreasureLockTest` | 8 |
| `MazeStructureTest` | 8 |
| `MazeGeneratorTest` | 7 |
| `ScoreCalculatorTest` | 7 |
| `MazeSolverTest` | 6 |
| `TriviaRepositoryTest` | 15 (9 ported + 6 validation) |
| `GameStateSerializationTest` | 22 (adapted; see Divergences) |
| `model` + `rng` | 11 |

Plus ported app-layer suites: `UiStateReducerTest` (22 vs Kotlin's 15), `ExitLayoutTest` (12 vs 8),
`RoomGeometryTest` (18 vs 9), `PlacementMapTest` (18 vs 14), `CharacterCatalogTest` (6 vs 4),
`RoomTreasureTest` (14), `ImageAssetManagerTest` (6, rewritten), `backdropName` (6), `hash` (8),
persistence (42), `useGameActions` (~20).

## Gameplay

**Solvability — 600/600 mazes solvable** (200 per tier), checked with the same `MazeSolver` the
generator uses to reject bad mazes. An unsolvable maze is the worst defect this app could ship: a
child hits a dead end with no way forward and no explanation.

**Full games won at every tier**, played through the real engine and reducer (3 seeds each):

| Tier | Won | Correct answers | Lock |
|---|---|---|---|
| SIMPLE | 3/3 | 5–7 | Open |
| MEDIUM | 3/3 | 10–13 | Locked (key fetch) |
| HARD | 3/3 | 21–27 | Barred (two windlasses × 3 questions) |

The answer counts show the intended difficulty progression rather than a flat curve.

**Generated maze shape** matches the Kotlin's tuning across 180 mazes: room counts exactly
30/55/85; loops-per-room 0.333/0.164/0.059 (correctly *inverted*, so the easy tier is the forgiving
one); shortest start→treasure paths inside the target bands 5–10 / 8–14 / 11–20; HARD averaging
21.7 dead ends against the Kotlin comment's "~22"; every one of 156 treasure-room doors blocked
across 80 MEDIUM+HARD mazes, so no lucky-direction walk-in exists.

**Results screen** — driven through the real reducer on `TreasureFound`: 300 coins + 1350 answers
+ 3855 time + 5000 jewel = **10505**, components summing exactly.

## The app itself

Launched through `package.json`'s `main` — the way a packaged build starts, not via the dev server.

- **Menu** renders the drawbridge backdrop, five topics, `KINDERGARTEN`/`SIMPLE` defaults matching Kotlin.
- **A room renders** with backdrop, authored inhabitant, HUD and minimap.
- **Mouse**: clicking a door raises a trivia question on the parchment dialog, drawn over the room
  so the door stays visible. A wrong answer keeps the door shut and toasts "Not quite!". Clicking a
  blank wall correctly does nothing.
- **Keyboard only**: an arrow attempts a door, `A`–`D` answer. Same `PlayerAction`s as the mouse.
- **Resize**: the canvas holds a fixed internal buffer (1792×1600 = 896×800 × dpr 2) scaled by CSS,
  so pane aspect stays 1.12 at 1280×860, at the 900×600 minimum and at 1600×1000. Constant aspect
  is what keeps doors aligned with their click regions at any window size.
- **Persistence across a real relaunch**: first launch offers no Resume (fresh profile), writes
  `game_state.json`, `saved_game.json`, `settings.json`; second launch offers Resume, and clicking
  it restores the game and redraws the room.
- **Music**: starts looped at volume 0.4 on the first user gesture (Chromium blocks autoplay
  earlier), repeated starts do not stack tracks, disabling is a no-op, re-enabling works.
- **Security**: `contextIsolation`, `nodeIntegration: false` and `sandbox: true` all on. Attacking
  the real IPC channel, a string payload is accepted while `Uint8Array`, object, number and null
  are rejected. Path traversal, null bytes, `__proto__` and a 100K-char name are all refused by the
  four-filename allowlist.

## Divergences from the Android build

Three, each deliberate and commented in code.

1. **`useGame.ts` — the windlass softlock is fixed.** `GameViewModel.kt:340` arms
   `windlassPending` *before* calling `turnWindlass()`, which has four early returns that pose no
   question. The flag then sticks, and the next **door** answer routes to `answerWindlass()`,
   which swallows it and leaves the trivia dialog on screen with no way out. Reachable by clicking
   an already-raised windlass, or the winch area in a non-windlass room, then walking to any closed
   door. The port arms the flag only when a question was actually posed. **The same two-line change
   would fix the Android build.**

2. **Save-file compatibility is a non-goal.** The port defines its own on-disk shape and does not
   read a file written by the Android app. The two run on different devices with no transfer path.
   The pre-envelope legacy fallback *is* preserved, so a save written before `entryDirection`
   existed still loads.

3. **`SettingsStore` treats an explicitly-empty topic set as "all topics"**, where Kotlin would
   return it empty. Unreachable through the UI — the menu never lets a player deselect their last
   topic — and the fallback is the safer direction, since an empty pool would silently widen to the
   whole question bank.

Two behaviours were *preserved* despite looking like bugs: a game saved mid-trivia forgets the
pending question (the engine keeps that state outside `GameState`, as on Android), and question
selection is unseeded (matching Kotlin's bare `.random()`).

## Not verified

- **macOS and Windows builds.** Neither can be produced on this Linux machine; the CI workflow
  builds them. Nothing here has run on either platform.
- **Hand-resizing the window by dragging.** Sizes were set programmatically.
- **A human playing a full maze by hand.** Full games were driven programmatically through the real
  engine and reducer; the UI was exercised by scripted clicks and keystrokes.
- **The room/minimap renderers have no unit tests**, matching the Android project's own deferral
  of Compose UI tests. Their gate is the typecheck plus the visual checks above.
- **Side-by-side pixel comparison against Android.** `mindmaze/samples/*.png` are placeholder-era
  renders at aspect 1.44–2.95, predating both the hand-drawn backdrops and the 1.25 `SPEC_ASPECT`,
  so they are not a valid baseline. Rendering was instead verified against the shipped drawables.
