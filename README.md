# MindMaze

A maze-exploration trivia game: explore a castle, answer trivia questions to open doors and
raise portcullises, and find the treasure. This is a desktop (Electron) port of the original
Android app, built so the game can be played on Windows and macOS as well as Linux — the
Android version lives at `../mindmaze` (a read-only reference for this port; it is not part of
this repository and still ships separately for Android).

## Development

Requires Node.js 22+.

```bash
npm install
npm run dev
```

`npm run dev` starts Vite's dev server and launches the Electron window against it, with hot
reload for both the renderer and the main process.

## Tests

```bash
npm test           # run once
npm run test:watch # watch mode
npm run typecheck  # tsc --noEmit
npm run check-assets  # verifies every character id in character_placements.json resolves to a drawable
```

`npm test` runs 314 tests across the game engine, UI reducer, and rendering/persistence layers,
ported from the Android app's Kotlin test suites. See `docs/verification.md` for what was checked
beyond automated tests (solvability of generated mazes, full games played through the real
engine at every difficulty tier, etc).

## Building

Production artifacts are built with [electron-builder](https://www.electron.build/), configured
in `electron-builder.yml`. All builds are **unsigned** — see [Unsigned builds](#unsigned-builds-and-first-launch)
below for why, and what that means for first launch.

```bash
npm run dist:linux   # -> release/*.AppImage
npm run dist:win     # -> release/*.exe (NSIS installer)
npm run dist:mac     # -> release/*.dmg (x64 + arm64) — see note below
```

Each of these runs `npm run build` first, then packages the result for that platform.
`npm run dist` (no suffix) builds for whatever platform you're currently on.

### Where the macOS build comes from

**`dist:mac` is not part of the local development workflow.** electron-builder can only produce
a `.dmg` when it runs on an actual Mac, and this project is developed on Linux — the only Mac
available to the developer is a work machine that is deliberately not used for this. The script
exists for completeness (and so `npm run dist:mac` does something sensible if ever run on a Mac),
but the macOS artifact that actually reaches users is built by GitHub Actions
(`.github/workflows/build.yml`), which runs a `macos-latest` runner. Pushing a `v*` tag is what
triggers it — see [Releasing](#releasing) below.

### Unsigned builds and first launch

Code-signing a macOS build costs $99/year for an Apple Developer ID, and a Windows build needs
its own paid code-signing certificate. Neither is justified for an app distributed informally to
family. All three platform builds are unsigned, which means the OS shows a warning on first
launch — the app is safe to run, the warning just means "not signed by a recognized publisher."

**macOS:** double-clicking an unsigned app is blocked outright by Gatekeeper. Instead:
1. Open the `.dmg` and drag MindMaze to Applications.
2. In Applications, **right-click MindMaze and choose "Open"** (not a double-click).
3. A dialog appears warning the developer can't be verified — click **Open**.

This is only needed the first time; after that, MindMaze opens normally.

**Windows:** running the `.exe` triggers a SmartScreen warning ("Windows protected your PC").
Click **"More info"**, then **"Run anyway"**. Like macOS, this is a one-time step for the
installer.

**Linux:** the AppImage needs the executable bit set (`chmod +x MindMaze-*.AppImage`) and no
further trust step. If the AppImage's own sandboxing helper isn't installed setuid-root on your
system, launch with `./MindMaze-*.AppImage --no-sandbox` — this only relaxes the *AppImage's*
own layer, not any Electron security setting (see [Security](#security) below).

## Releasing

Tag pushes trigger the full pipeline in `.github/workflows/build.yml`:

1. **`test`** (ubuntu-latest): `npm run typecheck`, `npm run check-assets`, `npm test`.
2. **`build`** (macos-latest and windows-latest, in parallel, `fail-fast: false` — a Windows
   failure never cancels the macOS job, since the macOS build is the one that can't be re-run
   anywhere but CI): produces the `.dmg` and `.exe`, uploaded as workflow artifacts.
3. **`release`** (only on a `v*` tag): downloads both, attaches them to a GitHub Release with
   install instructions for each platform.

To cut a release:

```bash
git tag v1.0.0
git push --tags
```

The `.dmg` and `.exe` land on the repo's Releases page once the workflow finishes. The Linux
AppImage is not currently attached to releases (it's built and verified locally instead — see
above); add a `dist:linux` leg to the `build` matrix if that changes.

## Security

The Electron main process exposes only a narrow, allowlisted file-storage bridge to the
renderer (see `electron/main.ts` and `electron/preload.ts`) — `contextIsolation: true`,
`nodeIntegration: false`, and `sandbox: true` are all on and are not to be weakened. The renderer
cannot reach the filesystem directly under any circumstances; the `--no-sandbox` launcher flag
mentioned above for Linux affects only the AppImage's own privilege-drop helper, not this
`webPreferences` sandbox.
