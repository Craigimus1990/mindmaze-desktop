# MindMaze Electron Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the MindMaze Android tablet app to a cross-platform Electron desktop app so family members on iPhones can play on a Mac or Windows laptop.

**Architecture:** The pure-JVM `:game-engine` and the Compose-free UI state layer are translated to TypeScript; the Compose shell is replaced by React, and the `android.graphics.Canvas` renderers by HTML canvas. Structure mirrors the Kotlin source file-for-file so the two can be diffed by eye. The renderer process holds the whole game; the main process only opens a window and reads/writes four JSON files.

**Tech Stack:** Electron, Vite, TypeScript (strict), React, Vitest, electron-builder.

**Spec:** `docs/superpowers/specs/2026-09-14-electron-port-design.md`

**Source of truth:** the Kotlin app at `../mindmaze/`. It is **read-only** — no task modifies any file under it.

## Global Constraints

- **Running the app locally on this Linux box:** `npx electron` aborts with
  `FATAL:setuid_sandbox_host.cc(163)` because `node_modules/electron/dist/chrome-sandbox` is not
  `root:4755` and npm cannot make it so. Launch with `npx electron --no-sandbox` (or
  `npm run dev -- --no-sandbox`) for local verification. This is a launcher flag about this
  machine's file permissions — **never** relax the `sandbox: true` webPreference in
  `electron/main.ts` to work around it. Packaged macOS and Windows builds ship a correctly
  permissioned helper and are unaffected.

- **Node:** 22.x. **TypeScript:** strict mode, `noUncheckedIndexedAccess` on.
- **Grid:** `GRID_SIZE = 10`; room ids are `0..99`; direction offsets are NORTH `-10`, SOUTH `+10`, EAST `+1`, WEST `-1`.
- **No behaviour changes.** Every rule, threshold, string, and quirk matches the Kotlin original. Where the original is odd, preserve the oddity and note it — do not fix it in passing.
- **Engine purity:** nothing under `src/engine/` may import from `src/react/`, `src/rendering/`, `src/persistence/`, or any DOM/Electron API.
- **Dependency direction:** `react → ui → engine → model`; `rendering` depends only on `model` + canvas.
- **Naming:** TypeScript files keep their Kotlin counterparts' names (`MazeGenerator.kt` → `MazeGenerator.ts`), and ported functions keep their Kotlin names.
- **Doc comments:** carry across the Kotlin doc comments that explain *why*. They are the record of bugs already fixed.
- **Electron security:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The renderer never imports `fs` or `path`.
- **Voice is out of scope.** Do not port `voice/`.
- **Save-file compatibility with the Android app is a non-goal.**
- **Commit after every task.** Conventional Commits (`feat:`, `test:`, `chore:`, `fix:`, `docs:`).

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `electron/main.ts`, `electron/preload.ts`, `src/react/main.tsx`, `src/react/App.tsx`, `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run dev` (Vite + Electron), `npm test` (Vitest), `npm run build`, `npm run typecheck`.

- [ ] **Step 1: Initialise the package**

```bash
cd /home/mxwllhllm-big-cpu/projects/mindmaze_electron
npm init -y
npm install --save-dev electron@33 vite@5 typescript@5 @types/node \
  vite-plugin-electron vite-plugin-electron-renderer \
  @vitejs/plugin-react vitest@2 \
  react react-dom @types/react @types/react-dom
```

React and ReactDOM are runtime dependencies; move them out of devDependencies:

```bash
npm install react react-dom
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "electron", "tests"]
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  plugins: [
    react(),
    electron([
      { entry: 'electron/main.ts' },
      {
        entry: 'electron/preload.ts',
        onstart(args) { args.reload() },
      },
    ]),
    renderer(),
  ],
})
```

- [ ] **Step 4: Write `vitest.config.ts`**

Vitest runs the pure-logic suites in a Node environment — no DOM, no Electron.

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 5: Write `electron/main.ts`**

```ts
import { app, BrowserWindow } from 'electron'
import path from 'node:path'

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'MindMaze',
    backgroundColor: '#1a1410',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
```

The `window-all-closed` and `activate` handlers are macOS convention: closing the last window does not quit the app, and clicking the dock icon reopens it. macOS is a primary target, so this is in from the start.

- [ ] **Step 6: Write a stub `electron/preload.ts`**

Task 13 fills this in. For now it only proves the bridge works.

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('mindmaze', {
  ping: () => 'pong',
})
```

- [ ] **Step 7: Write `index.html` and the React entry**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MindMaze</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/react/main.tsx"></script>
  </body>
</html>
```

`src/react/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/react/App.tsx`:

```tsx
export const App = () => <h1>MindMaze</h1>
```

- [ ] **Step 8: Add scripts to `package.json`**

Set `"main": "dist-electron/main.js"` and `"type": "module"`, then:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 9: Write the smoke test**

```ts
// tests/smoke.test.ts
import { describe, it, expect } from 'vitest'

describe('toolchain', () => {
  it('runs TypeScript under Vitest', () => {
    const doubled: number[] = [1, 2, 3].map((n) => n * 2)
    expect(doubled).toEqual([2, 4, 6])
  })
})
```

- [ ] **Step 10: Verify the toolchain**

Run: `npm test`
Expected: 1 passed.

Run: `npm run typecheck`
Expected: exit 0, no output.

Run: `npm run dev`, confirm a window opens showing "MindMaze", then quit.
Expected: window opens, no console errors.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold Electron + Vite + TypeScript + Vitest"
```

---

### Task 2: Engine models

**Files:**
- Create: `src/engine/model/types.ts`, `src/engine/model/Direction.ts`, `src/engine/model/Room.ts`, `src/engine/model/Maze.ts`, `src/engine/model/GameState.ts`
- Test: `tests/engine/model.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: every model type the rest of the engine uses. Exact shapes below — later tasks rely on these names verbatim.

- [ ] **Step 1: Write the failing test**

```ts
// tests/engine/model.test.ts
import { describe, it, expect } from 'vitest'
import { opposite, directionOffset, DIRECTIONS } from '@/engine/model/Direction'
import { isRaised } from '@/engine/model/Maze'
import type { TreasureLock } from '@/engine/model/Maze'

describe('Direction', () => {
  it('opposite flips each direction', () => {
    expect(opposite('NORTH')).toBe('SOUTH')
    expect(opposite('SOUTH')).toBe('NORTH')
    expect(opposite('EAST')).toBe('WEST')
    expect(opposite('WEST')).toBe('EAST')
  })

  it('directionOffset matches the 10-wide grid', () => {
    expect(directionOffset('NORTH')).toBe(-10)
    expect(directionOffset('SOUTH')).toBe(10)
    expect(directionOffset('EAST')).toBe(1)
    expect(directionOffset('WEST')).toBe(-1)
  })

  it('DIRECTIONS lists all four', () => {
    expect(DIRECTIONS).toEqual(['NORTH', 'SOUTH', 'EAST', 'WEST'])
  })
})

describe('TreasureLock.Barred', () => {
  it('is raised only when every windlass is completed', () => {
    const partial: TreasureLock = {
      type: 'Barred',
      windlassRoomIds: new Set([3, 7]),
      completed: new Set([3]),
    }
    const done: TreasureLock = {
      type: 'Barred',
      windlassRoomIds: new Set([3, 7]),
      completed: new Set([3, 7]),
    }
    expect(isRaised(partial)).toBe(false)
    expect(isRaised(done)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/model.test.ts`
Expected: FAIL — cannot resolve `@/engine/model/Direction`.

- [ ] **Step 3: Write `src/engine/model/Direction.ts`**

```ts
export type Direction = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST'

export const DIRECTIONS: readonly Direction[] = ['NORTH', 'SOUTH', 'EAST', 'WEST']

export const opposite = (d: Direction): Direction => {
  switch (d) {
    case 'NORTH': return 'SOUTH'
    case 'SOUTH': return 'NORTH'
    case 'EAST': return 'WEST'
    case 'WEST': return 'EAST'
  }
}

/** Grid is 10 wide; a room id is row * 10 + col. */
export const GRID_SIZE = 10

export const directionOffset = (d: Direction): number => {
  switch (d) {
    case 'NORTH': return -GRID_SIZE
    case 'SOUTH': return GRID_SIZE
    case 'EAST': return 1
    case 'WEST': return -1
  }
}
```

- [ ] **Step 4: Write `src/engine/model/types.ts`**

Enums become string-literal unions so they serialise to exactly the strings the Kotlin app used.

```ts
export type Topic = 'MATH' | 'LITERATURE' | 'HISTORY' | 'GEOGRAPHY' | 'SCIENCE'

export const TOPICS: readonly Topic[] =
  ['MATH', 'LITERATURE', 'HISTORY', 'GEOGRAPHY', 'SCIENCE']

export type Difficulty =
  | 'KINDERGARTEN' | 'FIRST_GRADE' | 'SECOND_GRADE' | 'THIRD_GRADE'
  | 'FOURTH_GRADE' | 'FIFTH_GRADE' | 'MIDDLE_SCHOOL' | 'HIGH_SCHOOL' | 'ADULT'

export const DIFFICULTIES: readonly Difficulty[] = [
  'KINDERGARTEN', 'FIRST_GRADE', 'SECOND_GRADE', 'THIRD_GRADE',
  'FOURTH_GRADE', 'FIFTH_GRADE', 'MIDDLE_SCHOOL', 'HIGH_SCHOOL', 'ADULT',
]

/**
 * Which difficulties the menu offers. Kotlin carried this as a constructor property on the
 * enum; only KINDERGARTEN and ADULT have questions written for them.
 */
export const DIFFICULTY_ACTIVE: Readonly<Record<Difficulty, boolean>> = {
  KINDERGARTEN: true,
  FIRST_GRADE: false,
  SECOND_GRADE: false,
  THIRD_GRADE: false,
  FOURTH_GRADE: false,
  FIFTH_GRADE: false,
  MIDDLE_SCHOOL: false,
  HIGH_SCHOOL: false,
  ADULT: true,
}

export type Complexity = 'SIMPLE' | 'MEDIUM' | 'HARD'
export const COMPLEXITIES: readonly Complexity[] = ['SIMPLE', 'MEDIUM', 'HARD']

export type DoorState = 'CLOSED' | 'OPEN' | 'LOCKED'

export interface GameSettings {
  readonly topics: ReadonlySet<Topic>
  readonly difficulty: Difficulty
  readonly complexity: Complexity
}

export interface Inventory {
  readonly keys: number
  readonly hints: number
}

export interface TriviaQuestion {
  readonly id: string
  readonly topic: Topic
  readonly difficulty: Difficulty
  readonly question: string
  /** 4 entries, shuffled when the question is drawn. */
  readonly answers: readonly string[]
  readonly correctIndex: number
}

export interface GatePair {
  readonly id: string
  /** Which room + direction holds the currently-open gate. */
  readonly openRoomId: number
  readonly openDirection: import('./Direction').Direction
}
```

- [ ] **Step 5: Write `src/engine/model/Room.ts`**

Sealed classes become discriminated unions on `type`.

```ts
import type { Direction } from './Direction'
import type { DoorState } from './types'

export type ExitType =
  | { readonly type: 'Absent' }
  | { readonly type: 'Door'; readonly state: DoorState }
  | { readonly type: 'Gate'; readonly pairId: string; readonly open: boolean }

export const ABSENT: ExitType = { type: 'Absent' }
export const door = (state: DoorState): ExitType => ({ type: 'Door', state })
export const gate = (pairId: string, open: boolean): ExitType =>
  ({ type: 'Gate', pairId, open })

export type Pickup =
  | { readonly type: 'None' }
  | { readonly type: 'Coin' }
  | { readonly type: 'Key' }
  | { readonly type: 'Hint' }

export const PICKUP_NONE: Pickup = { type: 'None' }
export const PICKUP_COIN: Pickup = { type: 'Coin' }
export const PICKUP_KEY: Pickup = { type: 'Key' }
export const PICKUP_HINT: Pickup = { type: 'Hint' }

export interface Room {
  readonly id: number
  readonly exits: ReadonlyMap<Direction, ExitType>
  readonly pickup: Pickup
  readonly buttonGatePairId: string | null
}

export const makeRoom = (
  id: number,
  exits: ReadonlyMap<Direction, ExitType> = new Map(),
  pickup: Pickup = PICKUP_NONE,
  buttonGatePairId: string | null = null,
): Room => ({ id, exits, pickup, buttonGatePairId })
```

- [ ] **Step 6: Write `src/engine/model/Maze.ts`**

```ts
import type { GatePair } from './types'
import type { Room } from './Room'

export type TreasureLock =
  | { readonly type: 'Open' }
  | { readonly type: 'Locked'; readonly keyRoomId: number }
  | {
      readonly type: 'Barred'
      readonly windlassRoomIds: ReadonlySet<number>
      readonly completed: ReadonlySet<number>
    }

export const TREASURE_OPEN: TreasureLock = { type: 'Open' }

/** Kotlin had this as a property on Barred; TypeScript unions carry no methods. */
export const isRaised = (lock: TreasureLock): boolean =>
  lock.type === 'Barred' &&
  [...lock.windlassRoomIds].every((id) => lock.completed.has(id))

export const QUESTIONS_PER_WINDLASS = 3
export const WRONG_ANSWER_RESETS = true

export interface Maze {
  readonly rooms: ReadonlyMap<number, Room>
  readonly gatePairs: ReadonlyMap<string, GatePair>
  readonly startId: number
  readonly treasureId: number
  readonly treasureLock: TreasureLock
}
```

- [ ] **Step 7: Write `src/engine/model/GameState.ts`**

Carry the Kotlin doc comments for `treasureBonus` and `windlassProgress` — both record a scoring bug and a save-format decision.

```ts
import type { Maze } from './Maze'
import type { GameSettings, Inventory } from './types'

export interface GameState {
  readonly maze: Maze
  readonly currentRoomId: number
  readonly visitedRoomIds: ReadonlySet<number>
  readonly inventory: Inventory
  readonly coinsCollected: number
  /**
   * Bonus points from jewels, over and above what coinsCollected already scores.
   *
   * Kept separate because ScoreCalculator multiplies the coin COUNT by COIN_POINTS; folding a
   * jewel's value into that field would multiply it again and score 40,000 for one gem.
   */
  readonly treasureBonus: number
  /**
   * Correct answers banked at each windlass so far, keyed by room id.
   *
   * Separate from Maze.treasureLock's completed set: that records finished windlasses, this
   * records work in progress. Held on the state rather than the room so it survives save/reload
   * without changing the Room shape.
   */
  readonly windlassProgress: ReadonlyMap<number, number>
  readonly correctAnswers: number
  readonly elapsedMillis: number
  readonly settings: GameSettings
  readonly isComplete: boolean
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/engine/model.test.ts`
Expected: PASS (3 in `Direction`, 1 in `TreasureLock.Barred`).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: port engine models to TypeScript"
```

---

### Task 3: Seeded RNG

**Files:**
- Create: `src/engine/engine/rng.ts`
- Test: `tests/engine/rng.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface Rng { nextInt(bound: number): number; nextBoolean(): boolean; pick<T>(items: readonly T[]): T; pickOrNull<T>(items: readonly T[]): T | null; shuffled<T>(items: readonly T[]): T[] }`, `makeRng(seed: number): Rng`, `defaultRng(): Rng`.

**Why this exists:** `MazeGenerator` takes an injected `Random`, and `MazeStructureTest` asserts that the same seed produces the same maze. `Math.random()` cannot be seeded, so porting naively would leave those tests passing while no longer checking anything. Kotlin call sites use five operations — `nextInt`, `nextBoolean`, `.random(rng)`, `.randomOrNull(rng)`, `.shuffled(rng)` — so all five appear on the interface.

**Known limit:** the same seed does *not* reproduce Kotlin's mazes; the bit generators differ. Determinism holds within this port, which is what the tests need.

- [ ] **Step 1: Write the failing test**

```ts
// tests/engine/rng.test.ts
import { describe, it, expect } from 'vitest'
import { makeRng } from '@/engine/engine/rng'

describe('makeRng', () => {
  it('is deterministic for a seed', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    const drawA = Array.from({ length: 20 }, () => a.nextInt(1000))
    const drawB = Array.from({ length: 20 }, () => b.nextInt(1000))
    expect(drawA).toEqual(drawB)
  })

  it('differs across seeds', () => {
    const a = Array.from({ length: 20 }, () => makeRng(1).nextInt(1000))
    const b = Array.from({ length: 20 }, () => makeRng(2).nextInt(1000))
    expect(a).not.toEqual(b)
  })

  it('nextInt stays within [0, bound)', () => {
    const rng = makeRng(7)
    for (let i = 0; i < 500; i++) {
      const n = rng.nextInt(10)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(10)
    }
  })

  it('shuffled preserves every element', () => {
    const rng = makeRng(3)
    const source = [1, 2, 3, 4, 5, 6, 7, 8]
    const shuffled = rng.shuffled(source)
    expect([...shuffled].sort((x, y) => x - y)).toEqual(source)
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8]) // input untouched
  })

  it('shuffled actually reorders over repeated draws', () => {
    const rng = makeRng(11)
    const source = [1, 2, 3, 4, 5, 6, 7, 8]
    const seen = new Set(
      Array.from({ length: 20 }, () => rng.shuffled(source).join(',')),
    )
    expect(seen.size).toBeGreaterThan(1)
  })

  it('pickOrNull returns null only for an empty list', () => {
    const rng = makeRng(5)
    expect(rng.pickOrNull([])).toBeNull()
    expect(rng.pickOrNull(['only'])).toBe('only')
  })

  it('pick draws from the list', () => {
    const rng = makeRng(9)
    const items = ['a', 'b', 'c']
    for (let i = 0; i < 50; i++) expect(items).toContain(rng.pick(items))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/rng.test.ts`
Expected: FAIL — cannot resolve `@/engine/engine/rng`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Seeded randomness for maze generation.
 *
 * MazeGenerator takes an injected RNG so a seed reproduces a maze; Math.random() cannot do
 * that, so this supplies the same contract Kotlin's Random offered the generator.
 *
 * Note: a seed does NOT reproduce the Kotlin app's mazes — the bit generators differ.
 * Determinism holds within this port, which is what the tests require.
 */
export interface Rng {
  /** Uniform integer in [0, bound). */
  nextInt(bound: number): number
  nextBoolean(): boolean
  /** Kotlin's List.random(rng). Throws on an empty list, as Kotlin does. */
  pick<T>(items: readonly T[]): T
  /** Kotlin's List.randomOrNull(rng). */
  pickOrNull<T>(items: readonly T[]): T | null
  /** Kotlin's List.shuffled(rng) — returns a new list, leaves the input alone. */
  shuffled<T>(items: readonly T[]): T[]
}

/** mulberry32: small, fast, and good enough for maze layout. */
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const fromFloat = (next: () => number): Rng => ({
  nextInt(bound: number): number {
    if (bound <= 0) throw new Error(`bound must be positive, got ${bound}`)
    return Math.floor(next() * bound)
  },
  nextBoolean(): boolean {
    return next() < 0.5
  },
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from an empty list')
    return items[Math.floor(next() * items.length)]!
  },
  pickOrNull<T>(items: readonly T[]): T | null {
    if (items.length === 0) return null
    return items[Math.floor(next() * items.length)]!
  },
  shuffled<T>(items: readonly T[]): T[] {
    // Fisher-Yates over a copy.
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      const a = out[i]!
      const b = out[j]!
      out[i] = b
      out[j] = a
    }
    return out
  },
})

export const makeRng = (seed: number): Rng => fromFloat(mulberry32(seed))

/** Time-seeded, for real games. */
export const defaultRng = (): Rng => makeRng(Date.now() ^ (Math.random() * 0x100000000))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/rng.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add seeded RNG for deterministic maze generation"
```

---

### Task 4: MazeSolver

**Files:**
- Create: `src/engine/engine/MazeSolver.ts`
- Test: `tests/engine/MazeSolver.test.ts`

**Interfaces:**
- Consumes: `Maze`, `Room`, `ExitType`, `Direction`, `directionOffset` (Task 2).
- Produces: `isSolvable(maze: Maze): boolean`, and the constant `TREASURE_GATE_ID = 'treasure'` (exported from here to avoid a cycle with `MazeGenerator`, which also needs it).

**Note on `TREASURE_GATE_ID`:** Kotlin declares it on `MazeGenerator` and `MazeSolver` imports it. In TypeScript that is a circular import, since `MazeGenerator` calls `isSolvable`. Declare it in `src/engine/engine/constants.ts` and have both import it. This is a structural change forced by the module system, not a behaviour change — note it in a comment.

- [ ] **Step 1: Write the failing test**

Ported from `MazeSolverTest.kt`.

```ts
// tests/engine/MazeSolver.test.ts
import { describe, it, expect } from 'vitest'
import { isSolvable } from '@/engine/engine/MazeSolver'
import { ABSENT, door, gate, makeRoom, PICKUP_KEY } from '@/engine/model/Room'
import { TREASURE_OPEN } from '@/engine/model/Maze'
import type { Maze } from '@/engine/model/Maze'
import type { ExitType } from '@/engine/model/Room'
import type { GatePair } from '@/engine/model/types'

const twoRoomMaze = (exit: ExitType): Maze => ({
  rooms: new Map([
    [0, makeRoom(0, new Map([['EAST', exit]]))],
    [1, makeRoom(1, new Map([['WEST', exit]]))],
  ]),
  gatePairs: new Map(),
  startId: 0,
  treasureId: 1,
  treasureLock: TREASURE_OPEN,
})

describe('MazeSolver', () => {
  it('open door between start and treasure is solvable', () => {
    expect(isSolvable(twoRoomMaze(door('OPEN')))).toBe(true)
  })

  it('closed door between start and treasure is solvable', () => {
    expect(isSolvable(twoRoomMaze(door('CLOSED')))).toBe(true)
  })

  it('absent exit between only two rooms is not solvable', () => {
    expect(isSolvable(twoRoomMaze(ABSENT))).toBe(false)
  })

  it('locked door with no key in maze is not solvable', () => {
    expect(isSolvable(twoRoomMaze(door('LOCKED')))).toBe(false)
  })

  it('locked door with key available is solvable', () => {
    const maze: Maze = {
      rooms: new Map([
        [0, makeRoom(0, new Map([['EAST', door('LOCKED')]]), PICKUP_KEY)],
        [1, makeRoom(1, new Map([['WEST', door('LOCKED')]]))],
      ]),
      gatePairs: new Map(),
      startId: 0,
      treasureId: 1,
      treasureLock: TREASURE_OPEN,
    }
    expect(isSolvable(maze)).toBe(true)
  })

  it('open gate allows passage', () => {
    const pair: GatePair = { id: 'A', openRoomId: 0, openDirection: 'EAST' }
    const maze: Maze = {
      rooms: new Map([
        [0, makeRoom(0, new Map([['EAST', gate('A', true)]]))],
        [1, makeRoom(1, new Map([['WEST', gate('A', false)]]))],
      ]),
      gatePairs: new Map([['A', pair]]),
      startId: 0,
      treasureId: 1,
      treasureLock: TREASURE_OPEN,
    }
    expect(isSolvable(maze)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/MazeSolver.test.ts`
Expected: FAIL — cannot resolve `@/engine/engine/MazeSolver`.

- [ ] **Step 3: Write `src/engine/engine/constants.ts`**

```ts
/**
 * Gate pair id for the barrier on the treasure room, raised by the windlasses.
 *
 * Kotlin declared this on MazeGenerator, but MazeGenerator calls MazeSolver.isSolvable and
 * MazeSolver needs the id — a cycle under ES modules. Both import it from here instead.
 */
export const TREASURE_GATE_ID = 'treasure'
```

- [ ] **Step 4: Write `src/engine/engine/MazeSolver.ts`**

```ts
import { directionOffset } from '../model/Direction'
import type { Maze } from '../model/Maze'
import { TREASURE_GATE_ID } from './constants'

export const isSolvable = (maze: Maze): boolean => bfsWithKeys(maze)

const bfsWithKeys = (maze: Maze): boolean => {
  // Cap keys at the total key count to bound the state space.
  let maxKeys = 0
  for (const room of maze.rooms.values()) {
    if (room.pickup.type === 'Key') maxKeys++
  }

  const key = (roomId: number, keys: number) => `${roomId}:${keys}`
  const visited = new Set<string>()
  const queue: Array<{ roomId: number; keys: number }> = [
    { roomId: maze.startId, keys: 0 },
  ]

  while (queue.length > 0) {
    const current = queue.shift()!
    const stateKey = key(current.roomId, current.keys)
    if (visited.has(stateKey)) continue
    visited.add(stateKey)

    if (current.roomId === maze.treasureId) return true

    const room = maze.rooms.get(current.roomId)
    if (!room) continue

    const keys =
      room.pickup.type === 'Key'
        ? Math.min(current.keys + 1, maxKeys)
        : current.keys

    for (const [dir, exit] of room.exits) {
      const neighborId = current.roomId + directionOffset(dir)
      if (!maze.rooms.has(neighborId)) continue

      switch (exit.type) {
        case 'Absent':
          continue
        case 'Door':
          if (exit.state === 'OPEN' || exit.state === 'CLOSED') {
            queue.push({ roomId: neighborId, keys })
          } else if (keys > 0) {
            queue.push({ roomId: neighborId, keys: keys - 1 })
          }
          break
        case 'Gate':
          if (exit.open) {
            queue.push({ roomId: neighborId, keys })
          } else if (
            // The treasure gate is raised by visiting the windlass rooms, which the generator
            // guarantees are reachable without crossing it. Treating it as a wall declared every
            // HARD maze unsolvable — sending generation through all 40 retries and its fallback
            // on every attempt, at 149 SECONDS per maze.
            exit.pairId === TREASURE_GATE_ID &&
            maze.treasureLock.type === 'Barred'
          ) {
            queue.push({ roomId: neighborId, keys })
          }
          break
      }
    }
  }
  return false
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/engine/MazeSolver.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: port MazeSolver"
```

---

### Task 5: MazeGenerator

**Files:**
- Create: `src/engine/engine/MazeGenerator.ts`
- Test: `tests/engine/MazeGenerator.test.ts`, `tests/engine/MazeStructure.test.ts`

**Interfaces:**
- Consumes: `Rng`/`makeRng`/`defaultRng` (Task 3), `isSolvable` + `TREASURE_GATE_ID` (Task 4), all models (Task 2).
- Produces: `generate(complexity: Complexity, rng?: Rng): Maze`.

This is the largest and most important task in the plan. Read `../mindmaze/game-engine/src/main/kotlin/com/mindmaze/engine/engine/MazeGenerator.kt` in full before starting, and port it function by function, keeping every doc comment.

**Do not port** `addLockedDoors`, `addGates`, `addButtons`, or `manhattanDistance`. They are dead code in the Kotlin original — `buildRoomsWithFeatures` no longer calls them, and `MazeGeneratorTest` asserts no ordinary gates or buttons are generated. Porting dead code would mean maintaining it twice.

- [ ] **Step 1: Write the failing tests**

Ported from `MazeGeneratorTest.kt` and `MazeStructureTest.kt`. `@RepeatedTest(n)` has no Vitest equivalent, so it becomes an explicit loop.

```ts
// tests/engine/MazeGenerator.test.ts
import { describe, it, expect } from 'vitest'
import { generate } from '@/engine/engine/MazeGenerator'
import { isSolvable } from '@/engine/engine/MazeSolver'
import { TREASURE_GATE_ID } from '@/engine/engine/constants'
import { makeRng } from '@/engine/engine/rng'
import { COMPLEXITIES } from '@/engine/model/types'
import { directionOffset } from '@/engine/model/Direction'
import type { Maze } from '@/engine/model/Maze'

const edgeCount = (maze: Maze): number => {
  let n = 0
  for (const room of maze.rooms.values()) {
    for (const exit of room.exits.values()) if (exit.type !== 'Absent') n++
  }
  return n / 2
}

describe('MazeGenerator', () => {
  it('generated maze is always solvable', () => {
    for (let i = 0; i < 10; i++) {
      for (const complexity of COMPLEXITIES) {
        const maze = generate(complexity, makeRng(i))
        expect(isSolvable(maze), `complexity ${complexity} seed ${i}`).toBe(true)
      }
    }
  })

  it('generated maze has loops', () => {
    for (let i = 0; i < 5; i++) {
      const maze = generate('HARD', makeRng(i))
      expect(edgeCount(maze)).toBeGreaterThan(maze.rooms.size - 1)
    }
  })

  it('simple complexity has no locked doors or gates', () => {
    for (let i = 0; i < 5; i++) {
      const maze = generate('SIMPLE', makeRng(i))
      for (const room of maze.rooms.values()) {
        for (const exit of room.exits.values()) {
          expect(exit.type).not.toBe('Gate')
          if (exit.type === 'Door') expect(exit.state).not.toBe('LOCKED')
        }
      }
    }
  })

  it('key count equals locked door count', () => {
    for (let i = 0; i < 5; i++) {
      const maze = generate('HARD', makeRng(i))
      let keyCount = 0
      for (const room of maze.rooms.values()) {
        if (room.pickup.type === 'Key') keyCount++
      }
      // Treasure doors are excluded: on HARD they are barred by the treasure gate, and on
      // MEDIUM the treasure's lock has its own key tracked by TreasureLock.Locked.
      let lockedHalfEdges = 0
      for (const room of maze.rooms.values()) {
        if (room.id === maze.treasureId) continue
        for (const [dir, exit] of room.exits) {
          if (
            exit.type === 'Door' &&
            exit.state === 'LOCKED' &&
            room.id + directionOffset(dir) !== maze.treasureId
          ) {
            lockedHalfEdges++
          }
        }
      }
      expect(keyCount).toBe(lockedHalfEdges / 2)
    }
  })

  it('start and treasure rooms are different', () => {
    const maze = generate('SIMPLE', makeRng(1))
    expect(maze.startId).not.toBe(maze.treasureId)
  })

  it('all rooms have ids in 0..99', () => {
    const maze = generate('SIMPLE', makeRng(2))
    for (const id of maze.rooms.keys()) {
      expect(id).toBeGreaterThanOrEqual(0)
      expect(id).toBeLessThanOrEqual(99)
    }
  })

  it('no ordinary gates or buttons are generated', () => {
    for (let i = 0; i < 5; i++) {
      const maze = generate('HARD', makeRng(i))
      expect(maze.gatePairs.size).toBe(0)
      for (const room of maze.rooms.values()) {
        expect(room.buttonGatePairId).toBeNull()
        for (const exit of room.exits.values()) {
          // The treasure barrier still uses a Gate, so any gate must be that one.
          if (exit.type === 'Gate') expect(exit.pairId).toBe(TREASURE_GATE_ID)
        }
      }
    }
  })
})
```

```ts
// tests/engine/MazeStructure.test.ts
import { describe, it, expect } from 'vitest'
import { generate } from '@/engine/engine/MazeGenerator'
import { makeRng } from '@/engine/engine/rng'
import { COMPLEXITIES } from '@/engine/model/types'
import { directionOffset, opposite } from '@/engine/model/Direction'
import type { Complexity } from '@/engine/model/types'
import type { Maze } from '@/engine/model/Maze'

/** Rooms reachable from the start, ignoring locks — the maze's actual shape. */
const reachable = (maze: Maze): Set<number> => {
  const seen = new Set([maze.startId])
  const queue = [maze.startId]
  while (queue.length > 0) {
    const cur = queue.shift()!
    const room = maze.rooms.get(cur)
    if (!room) continue
    for (const [dir, exit] of room.exits) {
      if (exit.type === 'Absent') continue
      const next = cur + directionOffset(dir)
      if (maze.rooms.has(next) && !seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

const mazes = (c: Complexity, n = 40): Maze[] =>
  Array.from({ length: n }, (_, i) => generate(c, makeRng(i)))

const average = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

describe('maze structure', () => {
  it('every room in the maze is reachable from the start', () => {
    for (const c of COMPLEXITIES) {
      for (const maze of mazes(c)) {
        expect(reachable(maze).size, `${c}: rooms walled off from the start`)
          .toBe(maze.rooms.size)
      }
    }
  })

  it('maze size grows with complexity', () => {
    const size = (c: Complexity) => average(mazes(c).map((m) => m.rooms.size))
    expect(size('SIMPLE')).toBeLessThan(size('MEDIUM'))
    expect(size('MEDIUM')).toBeLessThan(size('HARD'))
  })

  it('the treasure is never the start room', () => {
    for (const c of COMPLEXITIES) {
      for (const maze of mazes(c)) {
        expect(maze.treasureId).not.toBe(maze.startId)
        expect(maze.rooms.has(maze.treasureId)).toBe(true)
      }
    }
  })

  it('exits are symmetric', () => {
    // A one-way door would let a player walk into a room they cannot leave.
    for (const c of COMPLEXITIES) {
      for (const maze of mazes(c)) {
        for (const [id, room] of maze.rooms) {
          for (const [dir, exit] of room.exits) {
            if (exit.type === 'Absent') continue
            const neighbour = maze.rooms.get(id + directionOffset(dir))
            expect(neighbour, `${c}: room ${id} exit ${dir} leads outside the maze`)
              .toBeDefined()
            const back = neighbour!.exits.get(opposite(dir))
            expect(
              back !== undefined && back.type !== 'Absent',
              `${c}: room ${id} -> ${dir} is one-way`,
            ).toBe(true)
          }
        }
      }
    }
  })

  it('easier mazes have more loops than harder ones', () => {
    const loopsPerRoom = (maze: Maze): number => {
      let halfEdges = 0
      for (const room of maze.rooms.values()) {
        for (const exit of room.exits.values()) if (exit.type !== 'Absent') halfEdges++
      }
      const edges = halfEdges / 2
      return (edges - maze.rooms.size + 1) / maze.rooms.size
    }
    const simple = average(mazes('SIMPLE').map(loopsPerRoom))
    const hard = average(mazes('HARD').map(loopsPerRoom))
    expect(simple, `SIMPLE ${simple} should loop back more than HARD ${hard}`)
      .toBeGreaterThan(hard)
  })

  it('hard mazes offer enough dead ends for windlass rooms', () => {
    for (const maze of mazes('HARD')) {
      let deadEnds = 0
      for (const room of maze.rooms.values()) {
        let live = 0
        for (const exit of room.exits.values()) if (exit.type !== 'Absent') live++
        if (live <= 1 && room.id !== maze.startId && room.id !== maze.treasureId) deadEnds++
      }
      expect(deadEnds, 'the windlasses need two dead ends').toBeGreaterThanOrEqual(2)
    }
  })

  it('generation is deterministic for a seed', () => {
    for (const c of COMPLEXITIES) {
      const a = generate(c, makeRng(42))
      const b = generate(c, makeRng(42))
      expect([...a.rooms.keys()], `${c}: same seed gave a different maze`)
        .toEqual([...b.rooms.keys()])
      expect(a.startId).toBe(b.startId)
      expect(a.treasureId).toBe(b.treasureId)
    }
  })

  it('generation is fast enough to feel instant', () => {
    // A tuning pass once pushed this to 2.3s per maze, a visible stall on Start Game.
    const start = Date.now()
    for (let i = 0; i < 20; i++) generate('HARD', makeRng(i))
    const perMaze = (Date.now() - start) / 20
    expect(perMaze, `generation takes ${perMaze}ms per maze`).toBeLessThan(100)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/MazeGenerator.test.ts tests/engine/MazeStructure.test.ts`
Expected: FAIL — cannot resolve `@/engine/engine/MazeGenerator`.

- [ ] **Step 3: Write the tuning tables and helpers**

```ts
// src/engine/engine/MazeGenerator.ts
import { GRID_SIZE, DIRECTIONS, directionOffset, opposite } from '../model/Direction'
import type { Direction } from '../model/Direction'
import { ABSENT, door, gate, makeRoom, PICKUP_COIN, PICKUP_HINT, PICKUP_KEY } from '../model/Room'
import type { ExitType, Pickup, Room } from '../model/Room'
import { TREASURE_OPEN } from '../model/Maze'
import type { Maze, TreasureLock } from '../model/Maze'
import type { Complexity, GatePair } from '../model/types'
import { isSolvable } from './MazeSolver'
import { TREASURE_GATE_ID } from './constants'
import { defaultRng } from './rng'
import type { Rng } from './rng'

/**
 * How many of the grid's 100 cells the maze actually occupies, per tier.
 *
 * The maze is a tree grown to this size; every cell outside it is simply not part of the maze
 * and has no doors at all. That is deliberate — the original Encarta MindMaze did the same —
 * and it makes maze SIZE the complexity dial rather than a proxy for it.
 *
 * This replaced random edge removal from a full grid, which did not preserve connectivity:
 * past the percolation threshold the grid shattered into islands, and because the start was
 * chosen uniformly at random the player was regularly dropped into a 2-5 room offcut. HARD
 * averaged FOUR reachable rooms out of a hundred, and every existing check passed anyway.
 */
const MAZE_SIZE: Readonly<Record<Complexity, number>> = {
  SIMPLE: 30,
  MEDIUM: 55,
  HARD: 85,
}

/**
 * Extra connections added on top of the spanning tree, as a fraction of its edges.
 *
 * The forgiveness dial, independent of size. A tree has exactly one route between any two
 * rooms, so every wrong turn must be fully retraced; each extra edge creates a loop that lets
 * a wrong turn rejoin the path instead.
 *
 * Easier tiers get MORE loops: the tier children actually play should be the forgiving one.
 */
const EXTRA_EDGE_RATE: Readonly<Record<Complexity, number>> = {
  SIMPLE: 0.35,
  MEDIUM: 0.18,
  HARD: 0.06,
}

/**
 * Target band for the shortest start->treasure walk, in rooms.
 *
 * Advisory: a tree of a given size has a bounded diameter, so an unsatisfiable band would spin
 * the retry loop for nothing. When no room lands in the band the farthest one is used.
 */
const PATH_TARGET: Readonly<Record<Complexity, { min: number; max: number }>> = {
  SIMPLE: { min: 5, max: 10 },
  MEDIUM: { min: 8, max: 14 },
  HARD: { min: 11, max: 20 },
}

/**
 * Attempts before accepting a maze that misses the navigability targets.
 *
 * Generation is cheap and the targets are usually hit within a few tries, but a bound is needed
 * so a pathological seed cannot spin forever. Falling back to a merely-solvable maze is the
 * right failure: worse shape beats no game.
 */
const MAX_ATTEMPTS = 40

/** The up-to-four orthogonal neighbours of a cell, without wrapping across a row edge. */
const neighbours = (id: number): number[] => {
  const row = Math.floor(id / GRID_SIZE)
  const col = id % GRID_SIZE
  const out: number[] = []
  if (col > 0) out.push(id - 1)
  if (col < GRID_SIZE - 1) out.push(id + 1)
  if (row > 0) out.push(id - GRID_SIZE)
  if (row < GRID_SIZE - 1) out.push(id + GRID_SIZE)
  return out
}

const directionBetween = (a: number, b: number): Direction | null => {
  switch (b - a) {
    case 1: return 'EAST'
    case -1: return 'WEST'
    case GRID_SIZE: return 'SOUTH'
    case -GRID_SIZE: return 'NORTH'
    default: return null
  }
}

type ExitMap = Map<number, Map<Direction, ExitType>>

/** Opens a door between two adjacent cells, on both sides. */
const connect = (exits: ExitMap, a: number, b: number): void => {
  const dir = directionBetween(a, b)
  if (!dir) return
  exits.get(a)?.set(dir, door('CLOSED'))
  exits.get(b)?.set(opposite(dir), door('CLOSED'))
}

const linked = (exits: ExitMap, a: number, b: number): boolean => {
  const dir = directionBetween(a, b)
  if (!dir) return false
  return exits.get(a)?.get(dir) !== undefined
}
```

- [ ] **Step 4: Write `growTree` and the distance helpers**

```ts
/**
 * Grows a random spanning tree of `size` cells over the grid.
 *
 * Randomised Prim's: repeatedly pick a random cell already in the tree and attach one of its
 * free neighbours. Choosing the frontier cell at random — rather than always the newest —
 * produces a bushy tree with many short branches, which is what supplies the dead ends;
 * always taking the newest would grow one long snake.
 *
 * Returns each cell mapped to the cell it was attached from; the root maps to null.
 */
const growTree = (size: number, rng: Rng): Map<number, number | null> => {
  const parents = new Map<number, number | null>()
  const root = rng.nextInt(GRID_SIZE * GRID_SIZE)
  parents.set(root, null)
  const frontier: number[] = [root]

  while (parents.size < size && frontier.length > 0) {
    const index = rng.nextInt(frontier.length)
    const from = frontier[index]!
    const options = neighbours(from).filter((n) => !parents.has(n))
    if (options.length === 0) {
      // Boxed in by cells already taken; it can never contribute again.
      frontier.splice(index, 1)
      continue
    }
    const next = rng.pick(options)
    parents.set(next, from)
    frontier.push(next)
  }
  return parents
}

/**
 * Distances over the maze's *shape*, ignoring locked doors and closed gates.
 *
 * Deliberately different from MazeSolver, which models key collection to answer "can this be
 * finished". Navigability is about how a wrong turn feels to walk, and a locked door the player
 * will later open does not change the layout they have to navigate.
 */
const shapeDistances = (maze: Maze, from: number): Map<number, number> => {
  const dist = new Map<number, number>([[from, 0]])
  const queue = [from]
  while (queue.length > 0) {
    const cur = queue.shift()!
    const room = maze.rooms.get(cur)
    if (!room) continue
    for (const [dir, exit] of room.exits) {
      if (exit.type === 'Absent') continue
      const next = cur + directionOffset(dir)
      if (!maze.rooms.has(next) || dist.has(next)) continue
      dist.set(next, dist.get(cur)! + 1)
      queue.push(next)
    }
  }
  return dist
}

/** Rooms reachable from `startId` without ever entering `avoidId`. */
const reachableAvoiding = (
  rooms: ReadonlyMap<number, Room>,
  startId: number,
  avoidId: number,
): number[] => {
  const seen = new Set([startId])
  const queue = [startId]
  while (queue.length > 0) {
    const cur = queue.shift()!
    const room = rooms.get(cur)
    if (!room) continue
    for (const [dir, exit] of room.exits) {
      if (exit.type === 'Absent') continue
      const next = cur + directionOffset(dir)
      if (next === avoidId) continue
      if (rooms.has(next) && !seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return [...seen]
}
```

- [ ] **Step 5: Write `assignPickups` and `buildRoomsWithFeatures`**

```ts
const assignPickups = (
  rooms: Map<number, Room>,
  types: readonly Pickup[],
  startId: number,
  treasureId: number,
  rng: Rng,
): void => {
  const eligibleIds = rng.shuffled(
    [...rooms.keys()].filter((id) => id !== startId && id !== treasureId),
  )
  const rate = 0.2
  const count = Math.floor(eligibleIds.length * rate)
  for (const id of eligibleIds.slice(0, count)) {
    const pickup = rng.pick(types)
    rooms.set(id, { ...rooms.get(id)!, pickup })
  }
}

/**
 * Neither ordinary locked doors nor button-and-gate pairs are generated any more. Both were
 * extra blocking mechanisms scattered through the maze with no explanation, and on HARD they
 * sat alongside the windlasses — three unrelated systems at once. Each tier now has exactly one
 * idea: MEDIUM a key for the treasure, HARD two windlasses.
 *
 * ExitType.Gate itself stays — the treasure barrier uses it, and old saves still deserialise —
 * but nothing places one on an ordinary door.
 */
const buildRoomsWithFeatures = (
  roomExits: ExitMap,
  startId: number,
  treasureId: number,
  complexity: Complexity,
  rng: Rng,
): Map<number, Room> => {
  const rooms = new Map<number, Room>()
  for (const [id, exits] of roomExits) {
    rooms.set(id, makeRoom(id, new Map(exits)))
  }

  // Key excluded from the pickup pool on purpose: the ONLY key in the maze is the one
  // lockTreasure hides for a MEDIUM treasure door, so a key always means something.
  const types: readonly Pickup[] =
    complexity === 'SIMPLE' ? [PICKUP_COIN] : [PICKUP_COIN, PICKUP_HINT]
  assignPickups(rooms, types, startId, treasureId, rng)

  return rooms
}
```

- [ ] **Step 6: Write `lockTreasure`**

```ts
/**
 * Blocks every door into the treasure room and places what is needed to open it.
 *
 * SIMPLE leaves it alone — the youngest players should not face a fetch quest before the
 * payoff. MEDIUM locks it behind a key. HARD bars it behind two windlasses.
 *
 * EVERY approach is blocked, not just one: a single unguarded door would let the player wander
 * in from a lucky direction and skip the puzzle entirely.
 *
 * Prerequisites are drawn only from rooms reachable WITHOUT crossing the treasure door, which
 * is the invariant that keeps the maze winnable — a key hidden behind the very door it opens
 * would be unreachable, and would surface rarely enough to be miserable to diagnose.
 */
const lockTreasure = (
  rooms: Map<number, Room>,
  startId: number,
  treasureId: number,
  complexity: Complexity,
  rng: Rng,
): { rooms: Map<number, Room>; lock: TreasureLock } => {
  if (complexity === 'SIMPLE') return { rooms, lock: TREASURE_OPEN }

  const candidates = reachableAvoiding(rooms, startId, treasureId).filter(
    (id) => id !== startId && id !== treasureId,
  )
  if (candidates.length === 0) return { rooms, lock: TREASURE_OPEN }

  // Dead ends are read from the layout BEFORE the treasure doors change, so the counts are
  // about the maze's shape rather than about the barrier just applied to it.
  const deadEnds = candidates.filter((id) => {
    const room = rooms.get(id)!
    let live = 0
    for (const exit of room.exits.values()) if (exit.type !== 'Absent') live++
    return live <= 1
  })

  const updated = new Map(rooms)

  // Converts every live exit into the tier's barrier.
  const barrier = (e: ExitType): ExitType => {
    if (e.type === 'Absent') return e
    return complexity === 'MEDIUM'
      ? door('LOCKED')
      : gate(TREASURE_GATE_ID, false)
  }

  const treasure = updated.get(treasureId)
  if (!treasure) return { rooms, lock: TREASURE_OPEN }

  const barredExits = new Map<Direction, ExitType>()
  for (const [dir, exit] of treasure.exits) barredExits.set(dir, barrier(exit))
  updated.set(treasureId, { ...treasure, exits: barredExits })

  for (const [dir, exit] of treasure.exits) {
    if (exit.type === 'Absent') continue
    const neighbourId = treasureId + directionOffset(dir)
    const neighbour = updated.get(neighbourId)
    if (!neighbour) continue
    const facing = opposite(dir)
    const back = neighbour.exits.get(facing)
    if (!back) continue
    const exits = new Map(neighbour.exits)
    exits.set(facing, barrier(back))
    updated.set(neighbourId, { ...neighbour, exits })
  }

  if (complexity === 'MEDIUM') {
    const keyRoom = rng.pick(candidates)
    updated.set(keyRoom, { ...updated.get(keyRoom)!, pickup: PICKUP_KEY })
    return { rooms: updated, lock: { type: 'Locked', keyRoomId: keyRoom } }
  }

  // Dead ends specifically: a windlass at a junction is easy to walk past without noticing,
  // and the room should feel like a destination.
  const chosen = rng.shuffled(deadEnds).slice(0, 2)
  if (chosen.length < 2) {
    // Should not happen — HARD trees average 22 dead ends — but a key keeps the maze winnable
    // rather than shipping a gate nothing can raise.
    const keyRoom = rng.pick(candidates)
    const relocked = new Map<number, Room>()
    for (const [id, room] of updated) {
      const exits = new Map<Direction, ExitType>()
      for (const [dir, e] of room.exits) {
        exits.set(
          dir,
          e.type === 'Gate' && e.pairId === TREASURE_GATE_ID ? door('LOCKED') : e,
        )
      }
      relocked.set(id, { ...room, exits })
    }
    relocked.set(keyRoom, { ...relocked.get(keyRoom)!, pickup: PICKUP_KEY })
    return { rooms: relocked, lock: { type: 'Locked', keyRoomId: keyRoom } }
  }

  return {
    rooms: updated,
    lock: {
      type: 'Barred',
      windlassRoomIds: new Set(chosen),
      completed: new Set<number>(),
    },
  }
}
```

- [ ] **Step 7: Write `buildMaze`, `isNavigable`, and `generate`**

```ts
const buildMaze = (complexity: Complexity, rng: Rng): Maze => {
  const cells = growTree(MAZE_SIZE[complexity], rng)

  // Tree edges first: these alone guarantee every room reaches every other.
  const roomExits: ExitMap = new Map()
  for (const id of cells.keys()) roomExits.set(id, new Map())
  for (const [child, parent] of cells) {
    if (parent !== null) connect(roomExits, parent, child)
  }

  // Then extra edges for loops, drawn only from neighbours already inside the tree so the maze
  // never grows a door into a cell that is not part of it.
  let treeEdges = 0
  for (const parent of cells.values()) if (parent !== null) treeEdges++
  const wanted = Math.floor(treeEdges * EXTRA_EDGE_RATE[complexity])

  const candidateEdges: Array<[number, number]> = []
  for (const id of cells.keys()) {
    for (const n of neighbours(id)) {
      if (cells.has(n) && n > id && !linked(roomExits, id, n)) {
        candidateEdges.push([id, n])
      }
    }
  }
  for (const [a, b] of rng.shuffled(candidateEdges).slice(0, wanted)) {
    connect(roomExits, a, b)
  }

  const startId = rng.pick([...cells.keys()])
  const provisional: Maze = {
    rooms: new Map(
      [...roomExits].map(([id, exits]) => [id, makeRoom(id, new Map(exits))]),
    ),
    gatePairs: new Map(),
    startId,
    treasureId: startId,
    treasureLock: TREASURE_OPEN,
  }

  const reach = shapeDistances(provisional, startId)
  reach.delete(startId)
  const band = PATH_TARGET[complexity]
  const inBand = [...reach.keys()].filter((id) => {
    const d = reach.get(id)!
    return d >= band.min && d <= band.max
  })

  let treasureId = rng.pickOrNull(inBand)
  if (treasureId === null) {
    let best: number | null = null
    let bestDist = -1
    for (const [id, d] of reach) {
      if (d > bestDist) { bestDist = d; best = id }
    }
    treasureId = best ?? [...cells.keys()].find((id) => id !== startId)!
  }

  const gatePairs = new Map<string, GatePair>()
  const featured = buildRoomsWithFeatures(roomExits, startId, treasureId, complexity, rng)
  const { rooms, lock } = lockTreasure(featured, startId, treasureId, complexity, rng)

  return { rooms, gatePairs, startId, treasureId, treasureLock: lock }
}

/**
 * Whether a maze meets its tier's path-length target.
 *
 * The spur-depth check that used to live here is gone. It existed because random edge removal
 * could leave a fifteen-room corridor that dead-ended, and a child had to retrace every room of
 * it. A tree grown by randomised Prim's is bushy — short branches, many of them — so deep spurs
 * do not arise, and dead ends are now wanted rather than guarded against, since the windlass
 * rooms need them.
 */
const isNavigable = (maze: Maze, complexity: Complexity): boolean => {
  const shortest = shapeDistances(maze, maze.startId).get(maze.treasureId)
  if (shortest === undefined) return false
  const band = PATH_TARGET[complexity]
  return shortest >= band.min && shortest <= band.max
}

export const generate = (complexity: Complexity, rng: Rng = defaultRng()): Maze => {
  let fallback: Maze | null = null
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const maze = buildMaze(complexity, rng)
    if (!isSolvable(maze)) continue
    fallback ??= maze
    if (isNavigable(maze, complexity)) return maze
  }
  // Every attempt missed the navigability band; take any solvable maze over none.
  if (fallback) return fallback
  let maze: Maze
  do {
    maze = buildMaze(complexity, rng)
  } while (!isSolvable(maze))
  return maze
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run tests/engine/MazeGenerator.test.ts tests/engine/MazeStructure.test.ts`
Expected: PASS (7 + 8 = 15 tests).

If `easier mazes have more loops than harder ones` or `maze size grows with complexity` fails, check `EXTRA_EDGE_RATE` and `MAZE_SIZE` against the Kotlin tables — they are averages over 40 mazes and should hold comfortably.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: port MazeGenerator with seeded generation"
```

---

### Task 6: ScoreCalculator and TriviaRepository

**Files:**
- Create: `src/engine/engine/ScoreCalculator.ts`, `src/engine/engine/TriviaRepository.ts`
- Copy: `tests/fixtures/test_questions.json` from `../mindmaze/game-engine/src/test/resources/test_questions.json`
- Test: `tests/engine/ScoreCalculator.test.ts`, `tests/engine/TriviaRepository.test.ts`

**Interfaces:**
- Consumes: models (Task 2).
- Produces:
  - `COIN_POINTS = 100`, `ANSWER_POINTS = 50`, `MAX_TIME_BONUS = 5000`, `MAX_TIME_MILLIS = 1800000`
  - `interface ScoreBreakdown { coinPoints: number; answerPoints: number; timeBonus: number; treasureBonus: number; total: number }`
  - `computeScore(coins: number, correctAnswers: number, elapsedMillis: number, treasureBonus?: number): ScoreBreakdown`
  - `class TriviaRepository { constructor(questionsJson: string, topics: ReadonlySet<Topic>, difficulty: Difficulty); nextQuestion(): TriviaQuestion | null }`

**Note:** Kotlin's `ScoreBreakdown.total` is a computed property. TypeScript interfaces carry no getters, so `computeScore` returns `total` as a plain field.

**Note on RNG:** `TriviaRepository` uses bare `.random()`/`.shuffled()` in Kotlin with no injected RNG, so question choice is not seedable there either. Port it the same way, using `Math.random()`. Every ported assertion is a property (topic matches, no immediate repeat, correct answer text stable), so none needs a seed.

- [ ] **Step 1: Copy the test fixture**

```bash
mkdir -p tests/fixtures
cp ../mindmaze/game-engine/src/test/resources/test_questions.json tests/fixtures/
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/engine/ScoreCalculator.test.ts
import { describe, it, expect } from 'vitest'
import {
  computeScore, MAX_TIME_BONUS, MAX_TIME_MILLIS,
} from '@/engine/engine/ScoreCalculator'

describe('ScoreCalculator', () => {
  it('zero game gives zero score', () => {
    expect(computeScore(0, 0, MAX_TIME_MILLIS).total).toBe(0)
  })

  it('coins add 100 each', () => {
    expect(computeScore(3, 0, 0).coinPoints).toBe(300)
  })

  it('correct answers add 50 each', () => {
    expect(computeScore(0, 4, 0).answerPoints).toBe(200)
  })

  it('time bonus is max at zero elapsed', () => {
    expect(computeScore(0, 0, 0).timeBonus).toBe(MAX_TIME_BONUS)
  })

  it('time bonus is zero at or beyond max time', () => {
    expect(computeScore(0, 0, MAX_TIME_MILLIS).timeBonus).toBe(0)
  })

  it('time bonus decreases linearly', () => {
    expect(computeScore(0, 0, MAX_TIME_MILLIS / 2).timeBonus).toBe(MAX_TIME_BONUS / 2)
  })

  it('total is the sum of all components', () => {
    // coins=2 -> 200, answers=3 -> 150, elapsed=0 -> bonus=5000, total=5350
    expect(computeScore(2, 3, 0).total).toBe(5350)
  })
})
```

```ts
// tests/engine/TriviaRepository.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TriviaRepository } from '@/engine/engine/TriviaRepository'
import type { Difficulty, Topic } from '@/engine/model/types'

const json = readFileSync(
  join(__dirname, '../fixtures/test_questions.json'),
  'utf-8',
)

const repo = (topics: Topic[], difficulty: Difficulty) =>
  new TriviaRepository(json, new Set(topics), difficulty)

describe('TriviaRepository', () => {
  it('returns a question matching topic and difficulty', () => {
    const q = repo(['MATH'], 'KINDERGARTEN').nextQuestion()
    expect(q).not.toBeNull()
    expect(q!.topic).toBe('MATH')
    expect(q!.difficulty).toBe('KINDERGARTEN')
  })

  it('falls back to the difficulty when the topic has no questions', () => {
    // The fixture has no GEOGRAPHY questions. Returning null would softlock the maze:
    // every closed door needs a question to open.
    const q = repo(['GEOGRAPHY'], 'KINDERGARTEN').nextQuestion()
    expect(q, 'empty pool would make closed doors impassable').not.toBeNull()
    expect(q!.difficulty, 'difficulty is the last thing to relax').toBe('KINDERGARTEN')
  })

  it('falls back to the topic when the difficulty has no questions', () => {
    const q = repo(['SCIENCE'], 'HIGH_SCHOOL').nextQuestion()
    expect(q).not.toBeNull()
    expect(q!.topic).toBe('SCIENCE')
  })

  it('falls back to the whole bank when neither matches', () => {
    expect(repo(['GEOGRAPHY'], 'HIGH_SCHOOL').nextQuestion()).not.toBeNull()
  })

  it('an exact match is never diluted by the fallbacks', () => {
    const r = repo(['MATH'], 'KINDERGARTEN')
    for (let i = 0; i < 10; i++) {
      const q = r.nextQuestion()!
      expect(q.topic).toBe('MATH')
      expect(q.difficulty).toBe('KINDERGARTEN')
    }
  })

  it('does not repeat questions until the pool is exhausted', () => {
    const r = repo(['MATH'], 'KINDERGARTEN')
    expect(r.nextQuestion()!.id).not.toBe(r.nextQuestion()!.id)
  })

  it('recycles questions after the pool is exhausted', () => {
    const r = repo(['MATH'], 'KINDERGARTEN')
    const ids = Array.from({ length: 10 }, () => r.nextQuestion()?.id)
    expect(new Set(ids.filter(Boolean)).size).toBeLessThanOrEqual(2)
  })

  it('shuffles answer order at runtime', () => {
    const correct = Array.from({ length: 20 }, () => {
      const q = repo(['MATH'], 'ADULT').nextQuestion()!
      return q.answers[q.correctIndex]
    })
    // The correct answer text is the same regardless of shuffle.
    expect(new Set(correct).size).toBe(1)
  })

  it('multi-topic selection draws from all active topics', () => {
    const r = repo(['MATH', 'HISTORY', 'SCIENCE'], 'ADULT')
    const topics = new Set(
      Array.from({ length: 10 }, () => r.nextQuestion()?.topic).filter(Boolean),
    )
    expect(topics.size).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/engine/ScoreCalculator.test.ts tests/engine/TriviaRepository.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write `ScoreCalculator.ts`**

```ts
export const COIN_POINTS = 100
export const ANSWER_POINTS = 50
export const MAX_TIME_BONUS = 5000
export const MAX_TIME_MILLIS = 30 * 60 * 1000 // 30 minutes

export interface ScoreBreakdown {
  readonly coinPoints: number
  readonly answerPoints: number
  readonly timeBonus: number
  /** Extra value from jewels, over what their coin count already scores. */
  readonly treasureBonus: number
  /** Kotlin had this as a computed property; interfaces carry no getters. */
  readonly total: number
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(Math.max(n, lo), hi)

export const computeScore = (
  coins: number,
  correctAnswers: number,
  elapsedMillis: number,
  treasureBonus = 0,
): ScoreBreakdown => {
  const coinPoints = Math.max(coins, 0) * COIN_POINTS
  const answerPoints = Math.max(correctAnswers, 0) * ANSWER_POINTS
  const fraction = clamp(elapsedMillis, 0, MAX_TIME_MILLIS) / MAX_TIME_MILLIS
  const timeBonus = Math.trunc(MAX_TIME_BONUS * (1 - fraction))
  return {
    coinPoints,
    answerPoints,
    timeBonus,
    treasureBonus,
    total: coinPoints + answerPoints + timeBonus + treasureBonus,
  }
}
```

- [ ] **Step 5: Write `TriviaRepository.ts`**

```ts
import type { Difficulty, Topic, TriviaQuestion } from '../model/types'

interface RawQuestion {
  id: string
  topic: string
  difficulty: string
  question: string
  answers: string[]
  correctIndex: number
}

export class TriviaRepository {
  private readonly pool: readonly TriviaQuestion[]
  private readonly used = new Set<string>()

  constructor(
    questionsJson: string,
    topics: ReadonlySet<Topic>,
    difficulty: Difficulty,
  ) {
    const raw = JSON.parse(questionsJson) as RawQuestion[]
    const all: TriviaQuestion[] = raw.map((r) => ({
      id: r.id,
      topic: r.topic as Topic,
      difficulty: r.difficulty as Difficulty,
      question: r.question,
      answers: r.answers,
      correctIndex: r.correctIndex,
    }))

    // An empty pool is a softlock, not a cosmetic problem: nextQuestion() returns null, the
    // engine answers InvalidAction("No trivia questions available"), and every closed door in
    // the maze becomes impassable with no way for the player to tell why. So the player's exact
    // selection is a preference, not a hard constraint — relax it a step at a time rather than
    // hand back nothing.
    const exact = all.filter(
      (q) => q.difficulty === difficulty && topics.has(q.topic),
    )
    const byDifficulty = all.filter((q) => q.difficulty === difficulty)
    const byTopic = all.filter((q) => topics.has(q.topic))

    this.pool =
      exact.length > 0 ? exact
      : byDifficulty.length > 0 ? byDifficulty
      : byTopic.length > 0 ? byTopic
      : all
  }

  /** The next question with shuffled answer order, or null if the pool is empty. */
  nextQuestion(): TriviaQuestion | null {
    if (this.pool.length === 0) return null
    let candidates = this.pool.filter((q) => !this.used.has(q.id))
    if (candidates.length === 0) {
      this.used.clear()
      candidates = [...this.pool]
    }
    const raw = candidates[Math.floor(Math.random() * candidates.length)]!
    this.used.add(raw.id)
    return shuffleAnswers(raw)
  }
}

const shuffleAnswers = (q: TriviaQuestion): TriviaQuestion => {
  const correctText = q.answers[q.correctIndex]!
  const shuffled = [...q.answers]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = shuffled[i]!
    const b = shuffled[j]!
    shuffled[i] = b
    shuffled[j] = a
  }
  return { ...q, answers: shuffled, correctIndex: shuffled.indexOf(correctText) }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/engine/ScoreCalculator.test.ts tests/engine/TriviaRepository.test.ts`
Expected: PASS (7 + 9 = 16 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: port ScoreCalculator and TriviaRepository"
```

---

### Task 7: GameEvent and GameEngine

**Files:**
- Create: `src/engine/engine/GameEvent.ts`, `src/engine/engine/GameEngine.ts`
- Test: `tests/engine/GameEngine.test.ts`, `tests/engine/TreasureLock.test.ts`, `tests/engine/Windlass.test.ts`, `tests/engine/GameStateSerialization.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2-6.
- Produces: `type GameEvent` (discriminated union, 16 variants), and `class GameEngine` with `getState()`, `move(direction)`, `submitAnswer(answerIndex, correctIndex)`, `useKey()`, `useHint()`, `pressButton()`, `collectCoin(points)`, `turnWindlass()`, `answerWindlass(correct)` — each returning `GameEvent[]`.

**Before starting:** read `../mindmaze/game-engine/src/main/kotlin/com/mindmaze/engine/engine/GameEngine.kt` (the largest engine file) and the four Kotlin test files in full. Port method by method, running the relevant test after each.

**Preserve the quirk:** `pendingTriviaDirection`, `pendingWindlassRoom`, and `windlassExplained` are instance fields outside `GameState`, so they are not saved. A game saved mid-trivia reloads having forgotten the pending question. Keep this exactly; add a comment noting it is intentional and matches Android.

- [ ] **Step 1: Write `GameEvent.ts`**

```ts
import type { Direction } from '../model/Direction'
import type { Pickup } from '../model/Room'
import type { TreasureLock } from '../model/Maze'
import type { TriviaQuestion } from '../model/types'

export type GameEvent =
  /** Player attempted a door — present this question. */
  | { readonly type: 'TriviaRequired'; readonly question: TriviaQuestion; readonly direction: Direction }
  /** Door opened after a correct answer — the player has moved to newRoomId. */
  | { readonly type: 'DoorOpened'; readonly newRoomId: number }
  /** Player moved through an already-open door or gate. */
  | { readonly type: 'Moved'; readonly newRoomId: number }
  /** Wrong trivia answer — the door stays closed. */
  | { readonly type: 'WrongAnswer' }
  | { readonly type: 'PickupCollected'; readonly pickup: Pickup }
  /** Button pressed — gate pair flipped. */
  | { readonly type: 'GateFlipped'; readonly gatePairId: string }
  /** Locked door opened with a key; the player has moved through. Emitted before Moved. */
  | { readonly type: 'DoorUnlocked'; readonly direction: Direction }
  | { readonly type: 'TreasureFound' }
  /** A windlass question was answered wrongly and that windlass slipped back to zero. */
  | { readonly type: 'WindlassSlipped'; readonly roomId: number }
  /** The player has entered a windlass chamber for the first time this game. */
  | { readonly type: 'WindlassChamberFound'; readonly roomId: number }
  /** One more correct answer banked at a windlass, but it is not finished yet. */
  | { readonly type: 'WindlassProgressed'; readonly roomId: number; readonly banked: number; readonly needed: number }
  /** A windlass was fully raised. `remaining` is how many still need raising. */
  | { readonly type: 'WindlassRaised'; readonly roomId: number; readonly remaining: number }
  /** The player returned to a windlass they have already finished. */
  | { readonly type: 'WindlassAlreadyRaised'; readonly roomId: number }
  /** Every windlass is raised and the treasure gate has opened. */
  | { readonly type: 'TreasureGateOpened' }
  /** The player tried a treasure door that is still locked or barred. */
  | { readonly type: 'TreasureBlocked'; readonly lock: TreasureLock }
  /** Action was invalid in the current state (e.g. no key in inventory). */
  | { readonly type: 'InvalidAction'; readonly reason: string }
```

- [ ] **Step 2: Port the Kotlin test files**

Translate `GameEngineTest.kt` (429 lines), `TreasureLockTest.kt` (147), `WindlassTest.kt` (242), and `GameStateSerializationTest.kt` (57) to Vitest, one file at a time. Mechanical rules:

- `@Test fun \`name with backticks\`` → `it('name with backticks', () => { ... })`
- `assertEquals(expected, actual)` → `expect(actual).toBe(expected)` (`toEqual` for structures)
- `assertTrue(x)` / `assertFalse(x)` → `expect(x).toBe(true)` / `.toBe(false)`
- `assertIs<GameEvent.Moved>(e)` → `expect(e.type).toBe('Moved')`
- `events.filterIsInstance<GameEvent.Moved>()` → `events.filter((e) => e.type === 'Moved')`
- A Kotlin `Set`/`Map` literal → `new Set([...])` / `new Map([[k, v]])`

For `GameStateSerialization.test.ts`, write it against the port's own JSON shape, round-tripping a `GameState` through the Task 13 serialiser. It pins *this* app's save format; it does not assert agreement with Kotlin's output, since save-file compatibility is a non-goal. Because `GameState` holds `Set` and `Map`, add `serializeGameState` / `deserializeGameState` helpers in `src/persistence/serialization.ts` and test those. Task 13 consumes them.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/engine/GameEngine.test.ts`
Expected: FAIL — `@/engine/engine/GameEngine` not found.

- [ ] **Step 4: Port GameEngine method by method**

Work in this order, running the test file after each method so failures stay attributable:

1. constructor + `getState()`
2. `move(direction)` — the largest; handles Absent/Door/Gate, locked doors, the treasure barrier, and trivia
3. `submitAnswer(answerIndex, correctIndex)`
4. `performMove(targetId)` (private) — pickups, visited set, treasure detection
5. `collectCoin(points)`
6. `useKey()`, `useHint()`, `pressButton()`
7. `turnWindlass()`, `answerWindlass(correct)`

Structural notes for the port:

- Kotlin `state.copy(...)` → `this.state = { ...this.state, ... }`
- `state.maze.rooms + (id to room)` → `new Map(this.state.maze.rooms).set(id, room)`
- `mapValues { }` → build a new `Map` in a loop
- `coerceAtLeast(0)` → `Math.max(x, 0)`; `coerceAtMost(n)` → `Math.min(x, n)`
- Kotlin returns `List<GameEvent>`; return `GameEvent[]`
- `as? TreasureLock.Barred` → `lock.type === 'Barred' ? lock : null`

- [ ] **Step 5: Run the full engine suite**

Run: `npx vitest run tests/engine/`
Expected: PASS — every engine suite green. This is the completion criterion for the engine port.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: port GameEngine and complete the engine port"
```

---

### Task 8: UI state layer

**Files:**
- Create: `src/ui/UiState.ts`, `src/ui/PlayerAction.ts`, `src/ui/UiStateReducer.ts`, `src/util/ExitLayout.ts`
- Test: `tests/ui/UiStateReducer.test.ts`, `tests/util/ExitLayout.test.ts`

**Interfaces:**
- Consumes: engine (Tasks 2-7).
- Produces:
  - `type UiState` — union of `Menu`, `InGame`, `Trivia`, `Results`, `Message`, `Questions`
  - `type PlayerAction` — union of `AttemptDoor`, `Move`, `MoveBack`, `UseKey`, `UseHint`, `CollectTreasure`, `CollectPickup`, `PressButton`, `TurnWindlass`, `SubmitAnswer`
  - `reduce(current, events, newState, triggeredBy): UiState`, `applyHint(current: TriviaState): TriviaState`
  - `forEntry(entryDirection: Direction | null): ExitLayout`

Port `UiStateReducer.kt` including every toast and modal string **verbatim** — they are player-facing copy. Carry its doc comments, especially the ones on `reduce` (fold order: a terminal Results must win) and `applyHint` (idempotent; narrowing is a UI concern because the engine's `useHint()` has no knowledge of the pending question).

- [ ] **Step 1: Write the failing tests**

Port `UiStateReducerTest.kt` and `ExitLayoutTest.kt` from `../mindmaze/app/src/test/kotlin/com/mindmaze/app/`. Add these cases if not already present:

```ts
// tests/util/ExitLayout.test.ts
import { describe, it, expect } from 'vitest'
import { forEntry } from '@/util/ExitLayout'

describe('ExitLayout.forEntry', () => {
  // entryDirection points BACK the way the player came, so the player faces its opposite
  // and that facing is always the centre — straight ahead is the way back out.
  it('entering from the north faces south', () => {
    expect(forEntry('NORTH')).toEqual({ left: 'EAST', center: 'SOUTH', right: 'WEST' })
  })

  it('entering from the south faces north', () => {
    expect(forEntry('SOUTH')).toEqual({ left: 'WEST', center: 'NORTH', right: 'EAST' })
  })

  it('entering from the east faces west', () => {
    expect(forEntry('EAST')).toEqual({ left: 'SOUTH', center: 'WEST', right: 'NORTH' })
  })

  it('entering from the west faces east', () => {
    expect(forEntry('WEST')).toEqual({ left: 'NORTH', center: 'EAST', right: 'SOUTH' })
  })

  it('the start room faces north by convention', () => {
    expect(forEntry(null)).toEqual({ left: 'WEST', center: 'NORTH', right: 'EAST' })
  })

  it('left and right take the player perspective, not the map', () => {
    // Facing NORTH puts WEST on the left; facing SOUTH puts EAST there. Getting this backwards
    // is invisible in forward play and only shows up after backtracking.
    expect(forEntry('SOUTH').left).toBe('WEST')
    expect(forEntry('NORTH').left).toBe('EAST')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/ tests/util/`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/util/ExitLayout.ts`**

```ts
import type { Direction } from '../engine/model/Direction'

export interface ExitLayout {
  readonly left: Direction
  readonly center: Direction
  readonly right: Direction
}

/**
 * Lays out a room's exits relative to the player's view.
 *
 * `entryDirection` points *back* the way the player came (GameViewModel records
 * `opposite(moved)`), so the player faces its opposite, and that facing goes in `center` —
 * straight ahead is always the way back out.
 *
 * Left and right follow from the facing, taking the player's perspective rather than a map's:
 * facing NORTH puts WEST on the left, but facing SOUTH puts EAST there. Getting this backwards
 * is invisible in forward play — `center` is unaffected — and only shows up as a door appearing
 * on the wrong side after backtracking.
 */
export const forEntry = (entryDirection: Direction | null): ExitLayout => {
  switch (entryDirection) {
    case 'NORTH': return { left: 'EAST', center: 'SOUTH', right: 'WEST' }   // facing SOUTH
    case 'SOUTH': return { left: 'WEST', center: 'NORTH', right: 'EAST' }   // facing NORTH
    case 'EAST':  return { left: 'SOUTH', center: 'WEST', right: 'NORTH' }  // facing WEST
    case 'WEST':  return { left: 'NORTH', center: 'EAST', right: 'SOUTH' }  // facing EAST
    // Start room: nothing entered from, so face NORTH by convention.
    case null:    return { left: 'WEST', center: 'NORTH', right: 'EAST' }
  }
}
```

- [ ] **Step 4: Write `PlayerAction.ts`**

```ts
import type { Direction } from '../engine/model/Direction'

/**
 * Every player intent. Mouse and keyboard both produce these, so the two input paths
 * cannot diverge in behaviour.
 */
export type PlayerAction =
  | { readonly type: 'AttemptDoor'; readonly direction: Direction }
  | { readonly type: 'Move'; readonly direction: Direction }
  | { readonly type: 'MoveBack' }
  | { readonly type: 'UseKey' }
  | { readonly type: 'UseHint' }
  /** Clicking a coin or jewel drawn in the room. `points` depends on which was shown. */
  | { readonly type: 'CollectTreasure'; readonly points: number }
  | { readonly type: 'CollectPickup' }
  | { readonly type: 'PressButton' }
  /** Clicking the windlass sprite in a windlass chamber. */
  | { readonly type: 'TurnWindlass' }
  | { readonly type: 'SubmitAnswer'; readonly index: number }
```

- [ ] **Step 5: Write `UiState.ts`**

Port all six variants from `UiState.kt`, carrying the doc comments on `Trivia` (answers/correctIndex are the *displayed* set, narrowed after a hint), `Message` (a modal, not a toast, because it explains a rule the player must act on), and `Questions` (the merged view a game would draw from).

- [ ] **Step 6: Write `UiStateReducer.ts`**

Port `reduce` and `applyHint`. Every user-facing string is copied **exactly**, including the windlass explainer and the two `TreasureBlocked` bodies with their `left === windlassRoomIds.size` branch.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/ui/ tests/util/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: port the UI state layer"
```

---

### Task 9: Assets and the asset manifest

**Files:**
- Copy: 133 images → `src/assets/drawable/`, `music_market_day.mp3` → `src/assets/audio/`, `character_placements.json` + `questions.json` → `src/assets/data/`
- Create: `src/rendering/assetManifest.ts`, `scripts/check-assets.mjs`
- Test: `tests/rendering/assetManifest.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `assetUrl(name: string): string | undefined`, `hasAsset(name: string): boolean`, `ASSET_NAMES: readonly string[]`.

- [ ] **Step 1: Copy the assets**

```bash
mkdir -p src/assets/drawable src/assets/audio src/assets/data
cp ../mindmaze/app/src/main/res/drawable/* src/assets/drawable/
cp ../mindmaze/app/src/main/res/raw/music_market_day.mp3 src/assets/audio/
cp ../mindmaze/app/src/main/res/raw/character_placements.json src/assets/data/
cp ../mindmaze/app/src/main/assets/questions.json src/assets/data/
ls src/assets/drawable | wc -l   # expect 133
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/rendering/assetManifest.test.ts
import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const drawableDir = join(__dirname, '../../src/assets/drawable')

describe('drawable assets', () => {
  it('all 133 drawables are present', () => {
    expect(readdirSync(drawableDir).length).toBe(133)
  })

  it('every drawable is a web-servable format', () => {
    for (const f of readdirSync(drawableDir)) {
      expect(f, `${f} is not a web format`).toMatch(/\.(webp|png)$/)
    }
  })

  it('character sprites follow the char_ naming convention', () => {
    const chars = readdirSync(drawableDir).filter((f) => f.startsWith('char_'))
    expect(chars.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails or passes on copy**

Run: `npx vitest run tests/rendering/assetManifest.test.ts`
Expected: PASS once Step 1 has run (this test guards the copy, not new code).

- [ ] **Step 4: Write `src/rendering/assetManifest.ts`**

Android resolved `R.drawable.char_abbotess`; Vite's `import.meta.glob` with `eager: true` gives the same name→URL lookup at build time.

```ts
/**
 * Name-to-URL map for every drawable, keyed the way Android's R.drawable was.
 *
 * CharacterCatalog and the renderers refer to assets by bare name ("char_abbotess",
 * "great_library__room_with_left"), so the lookup keeps those names working unchanged.
 */
const modules = import.meta.glob<string>('../assets/drawable/*.{webp,png}', {
  eager: true,
  import: 'default',
  query: '?url',
})

const byName = new Map<string, string>()
for (const [path, url] of Object.entries(modules)) {
  const name = path.split('/').pop()!.replace(/\.(webp|png)$/, '')
  byName.set(name, url)
}

export const assetUrl = (name: string): string | undefined => byName.get(name)
export const hasAsset = (name: string): boolean => byName.has(name)
export const ASSET_NAMES: readonly string[] = [...byName.keys()].sort()

export const MUSIC_URL = new URL('../assets/audio/music_market_day.mp3', import.meta.url).href
```

- [ ] **Step 5: Write `scripts/check-assets.mjs`**

Replaces the Robolectric asset-existence tests: verifies every name the catalogs reference resolves to a file.

```js
// Verifies that every asset name referenced in source resolves to a real file.
// Replaces the Android Robolectric asset tests, which cannot run under Vitest.
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const drawables = new Set(
  readdirSync(join(root, 'src/assets/drawable')).map((f) =>
    f.replace(/\.(webp|png)$/, ''),
  ),
)

const placements = JSON.parse(
  readFileSync(join(root, 'src/assets/data/character_placements.json'), 'utf-8'),
)

const missing = []
const names = new Set()
const walk = (node) => {
  if (typeof node === 'string') { names.add(node); return }
  if (Array.isArray(node)) { node.forEach(walk); return }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) { names.add(k); walk(v) }
  }
}
walk(placements)

for (const name of names) {
  if (name.startsWith('char_') && !drawables.has(name)) missing.push(name)
}

if (missing.length > 0) {
  console.error('Missing drawables referenced by character_placements.json:')
  for (const m of missing) console.error(`  ${m}`)
  process.exit(1)
}
console.log(`OK: ${drawables.size} drawables, ${names.size} referenced names resolve.`)
```

Add to `package.json` scripts: `"check-assets": "node scripts/check-assets.mjs"`.

- [ ] **Step 6: Run the checks**

Run: `npm run check-assets`
Expected: `OK: 133 drawables, N referenced names resolve.` If names are missing, list them and compare against `CharacterCatalog.kt` before changing anything — a missing name means the copy was incomplete, not that the check is wrong.

Run: `npx vitest run tests/rendering/assetManifest.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: copy assets and add the name-to-URL manifest"
```

---

### Task 10: RoomGeometry and PlacementMap

**Files:**
- Create: `src/rendering/hash.ts`, `src/rendering/RoomGeometry.ts`, `src/rendering/PlacementMap.ts`, `src/rendering/CharacterCatalog.ts`
- Test: `tests/rendering/hash.test.ts`, `tests/rendering/RoomGeometry.test.ts`, `tests/rendering/PlacementMap.test.ts`, `tests/rendering/CharacterCatalog.test.ts`

**Interfaces:**
- Consumes: `assetManifest` (Task 9), models (Task 2).
- Produces: `RoomGeometry` constants and `visibleWidthFraction`, `visibleHeightFraction`, `projectX`, `projectY`, `doorScreenX`, `tapBoundaries`, `isAspectSupported`.

**`RoomGeometry` ports verbatim** — every constant, the projection math, and the whole doc comment. It is the single source of truth for door placement, and its comment records the bug that made it necessary. Do not restate the math in your own words and do not "simplify" it.

- [ ] **Step 1: Write the failing test**

Port `RoomGeometryTest.kt`, then add these projection cases:

```ts
// tests/rendering/RoomGeometry.test.ts
import { describe, it, expect } from 'vitest'
import {
  SPEC_ASPECT, MIN_ASPECT, MAX_ASPECT,
  DOOR_LEFT_X, DOOR_CENTER_X, DOOR_RIGHT_X, DOOR_CENTER_Y,
  visibleWidthFraction, visibleHeightFraction,
  projectX, projectY, doorScreenX, tapBoundaries, isAspectSupported,
} from '@/rendering/RoomGeometry'

describe('RoomGeometry', () => {
  it('holds the authored spec constants', () => {
    expect(SPEC_ASPECT).toBeCloseTo(1.25)
    expect(MIN_ASPECT).toBeCloseTo(1.10)
    expect(MAX_ASPECT).toBeCloseTo(1.65)
    expect(DOOR_LEFT_X).toBeCloseTo(0.16)
    expect(DOOR_CENTER_X).toBeCloseTo(0.50)
    expect(DOOR_RIGHT_X).toBeCloseTo(0.84)
    expect(DOOR_CENTER_Y).toBeCloseTo(0.60)
  })

  it('an asset matching the pane is not cropped', () => {
    expect(visibleWidthFraction(1.25, 1.25)).toBeCloseTo(1)
    expect(visibleHeightFraction(1.25, 1.25)).toBeCloseTo(1)
    expect(projectX(DOOR_LEFT_X, 1.25, 1.25)).toBeCloseTo(DOOR_LEFT_X)
  })

  it('a wider-than-pane asset is cropped horizontally, moving side doors outward', () => {
    // A 0.16 door lands at 0.136 on a 1.667 asset — the case the doc comment cites.
    expect(projectX(DOOR_LEFT_X, 1.667, 1.25)).toBeCloseTo(0.136, 2)
    expect(visibleHeightFraction(1.667, 1.25)).toBeCloseTo(1)
  })

  it('a narrower-than-pane asset passes x through untouched', () => {
    // Cropping takes from the height instead, so door x-fractions are unaffected.
    expect(projectX(DOOR_LEFT_X, 1.15, 1.25)).toBeCloseTo(DOOR_LEFT_X)
    expect(visibleWidthFraction(1.15, 1.25)).toBeCloseTo(1)
    expect(visibleHeightFraction(1.15, 1.25)).toBeLessThan(1)
  })

  it('the centre door never moves, whatever the crop', () => {
    for (const aspect of [1.1, 1.25, 1.4, 1.65]) {
      expect(projectX(DOOR_CENTER_X, aspect, 1.25)).toBeCloseTo(0.5)
      expect(projectY(0.5, aspect, 1.25)).toBeCloseTo(0.5)
    }
  })

  it('tap boundaries are the midpoints between adjacent door centres', () => {
    const x = doorScreenX(1.25, 1.25)
    const [lo, hi] = tapBoundaries(1.25, 1.25)
    expect(lo).toBeCloseTo((x[0]! + x[1]!) / 2)
    expect(hi).toBeCloseTo((x[1]! + x[2]!) / 2)
  })

  it('accepts aspects in the supported band and rejects the rest', () => {
    expect(isAspectSupported(1.25)).toBe(true)
    expect(isAspectSupported(MIN_ASPECT)).toBe(true)
    expect(isAspectSupported(MAX_ASPECT)).toBe(true)
    expect(isAspectSupported(1.05)).toBe(false)
    expect(isAspectSupported(1.9)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rendering/RoomGeometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/rendering/RoomGeometry.ts`**

Copy `RoomGeometry.kt` across, translating `const val` → `export const`, `object` → module scope, `List<Float>` → `readonly number[]`, and `Pair<Float, Float>` → `[number, number]`. **Carry the entire class-level doc comment and every property comment.** Kotlin `Float` becomes `number`.

```ts
/** Screen x-fractions of the three door slots for an asset of `sourceAspect`. */
export const doorScreenX = (sourceAspect: number, paneAspect: number): readonly number[] =>
  DOOR_X.map((x) => projectX(x, sourceAspect, paneAspect))

/**
 * Tap boundaries between the three slots: the midpoints between adjacent door centres, so each
 * door owns the region nearest it. Derived rather than hardcoded — the old code used a
 * thirds-split (0.34/0.67) justified in a comment as the bisectors of door positions it no
 * longer matched.
 */
export const tapBoundaries = (
  sourceAspect: number,
  paneAspect: number,
): [number, number] => {
  const x = doorScreenX(sourceAspect, paneAspect)
  return [(x[0]! + x[1]!) / 2, (x[1]! + x[2]!) / 2]
}
```

- [ ] **Step 4: Write `src/rendering/hash.ts` — the 32-bit avalanche**

**Kotlin Int arithmetic does not survive a naive port.** `PlacementMap.hash` (and the identical
copy in `RoomTreasure.kt`, ported in Task 12) relies on 32-bit signed wrapping multiplication and
an unsigned shift:

```kotlin
var h = roomId * -0x61c88647 xor salt
h = h xor (h ushr 15)
h *= -0x7ee3623b
h = h xor (h ushr 13)
```

JavaScript numbers are 64-bit floats: `*` does not wrap, so the product is simply a different
number, and the bucket it lands in changes. That reassigns characters and treasure sprites to
different rooms — a silent divergence from the Android build that also fails the ported tests.

Use `Math.imul` (which IS 32-bit wrapping multiply) and `>>>`:

```ts
/**
 * The 32-bit integer avalanche PlacementMap and RoomTreasure both key off.
 *
 * Math.imul, not `*`: Kotlin Int multiplication wraps at 32 bits and JavaScript's does not, so a
 * plain `*` silently lands in a different bucket and moves a room's character or treasure. `>>>`
 * matches Kotlin's `ushr`; `>>` would sign-extend and diverge on negative intermediates.
 */
export const avalanche = (roomId: number, salt: number): number => {
  let h = (Math.imul(roomId, -0x61c88647) ^ salt) | 0
  h = (h ^ (h >>> 15)) | 0
  h = Math.imul(h, -0x7ee3623b)
  return (h ^ (h >>> 13)) | 0
}

/** Kotlin's Math.floorMod — JS `%` keeps the sign of the dividend, which would throw off indexing. */
export const floorMod = (a: number, n: number): number => ((a % n) + n) % n

/** floorMod(avalanche(...), buckets), the form both call sites use. */
export const bucket = (roomId: number, salt: number, buckets: number): number =>
  floorMod(avalanche(roomId, salt), buckets)
```

Write `tests/rendering/hash.test.ts` asserting: `avalanche` returns a 32-bit integer for a range
of room ids (`Number.isInteger` and within `-2**31 .. 2**31-1`), that it is stable for a given
id, that adjacent ids land in different buckets (the avalanche's purpose), and that
`floorMod(-7, 1024)` is `1017` rather than JS's `-7`.

Task 12 imports `avalanche`/`bucket` from here rather than rewriting the arithmetic.

- [ ] **Step 5: Port `PlacementMap.ts` and `CharacterCatalog.ts`**

Read `../mindmaze/app/src/main/kotlin/com/mindmaze/app/rendering/PlacementMap.kt` (127 lines) and `CharacterCatalog.kt` (143 lines) and port them, reading `character_placements.json` through the asset manifest. Port their Kotlin tests alongside.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/rendering/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: port RoomGeometry, PlacementMap, CharacterCatalog, and the shared hash"
```

---

### Task 11: ImageAssetManager with preloading

**Files:**
- Create: `src/rendering/ImageAssetManager.ts`
- Test: `tests/rendering/ImageAssetManager.test.ts`

**Interfaces:**
- Consumes: `assetManifest` (Task 9).
- Produces: `class ImageAssetManager { load(name: string): Promise<HTMLImageElement>; get(name: string): HTMLImageElement | undefined; preload(names: readonly string[]): Promise<void> }`.

**This is the one deliberate divergence from the Android structure.** Android decoded drawables synchronously; the web's `Image` loads async, and a room drawn before its backdrop arrives flashes empty. So this class is rewritten rather than ported, and its test is new.

This test needs a DOM, so it runs under `jsdom`. Add `"environment: 'jsdom'"` via a docblock at the top of the test file and install `jsdom`:

```bash
npm install --save-dev jsdom
```

- [ ] **Step 1: Write the failing test**

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImageAssetManager } from '@/rendering/ImageAssetManager'

// jsdom's Image never fires load events on its own, so drive them manually.
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ''
  static instances: FakeImage[] = []
  constructor() { FakeImage.instances.push(this) }
  get src() { return this._src }
  set src(v: string) { this._src = v }
  fireLoad() { this.onload?.() }
  fireError() { this.onerror?.() }
}

beforeEach(() => {
  FakeImage.instances = []
  vi.stubGlobal('Image', FakeImage)
})

describe('ImageAssetManager', () => {
  it('resolves once the image loads', async () => {
    const mgr = new ImageAssetManager((n) => `/fake/${n}.webp`)
    const pending = mgr.load('pickup_key')
    FakeImage.instances[0]!.fireLoad()
    await expect(pending).resolves.toBeDefined()
    expect(mgr.get('pickup_key')).toBeDefined()
  })

  it('serves a cached image without creating a second request', async () => {
    const mgr = new ImageAssetManager((n) => `/fake/${n}.webp`)
    const first = mgr.load('pickup_key')
    FakeImage.instances[0]!.fireLoad()
    await first
    await mgr.load('pickup_key')
    expect(FakeImage.instances.length).toBe(1)
  })

  it('shares one request between concurrent callers', async () => {
    const mgr = new ImageAssetManager((n) => `/fake/${n}.webp`)
    const a = mgr.load('pickup_coin')
    const b = mgr.load('pickup_coin')
    expect(FakeImage.instances.length).toBe(1)
    FakeImage.instances[0]!.fireLoad()
    expect(await a).toBe(await b)
  })

  it('rejects rather than hanging when an image fails', async () => {
    // A hung promise would leave the game on a loading screen with no explanation.
    const mgr = new ImageAssetManager((n) => `/fake/${n}.webp`)
    const pending = mgr.load('missing_asset')
    FakeImage.instances[0]!.fireError()
    await expect(pending).rejects.toThrow(/missing_asset/)
  })

  it('rejects an unknown name without touching the network', async () => {
    const mgr = new ImageAssetManager(() => undefined)
    await expect(mgr.load('nope')).rejects.toThrow(/nope/)
    expect(FakeImage.instances.length).toBe(0)
  })

  it('preload resolves when every image has loaded', async () => {
    const mgr = new ImageAssetManager((n) => `/fake/${n}.webp`)
    const done = mgr.preload(['a', 'b'])
    FakeImage.instances.forEach((i) => i.fireLoad())
    await expect(done).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rendering/ImageAssetManager.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import { assetUrl } from './assetManifest'

/**
 * Loads and caches drawables.
 *
 * The Android original decoded resources synchronously and needed no cache of its own. The web
 * loads images asynchronously, and a room drawn before its backdrop has arrived flashes empty,
 * so this resolves a promise before first paint and holds decoded images for reuse.
 *
 * The resolver is injectable so tests need neither the bundler nor the network.
 */
export class ImageAssetManager {
  private readonly cache = new Map<string, HTMLImageElement>()
  private readonly inFlight = new Map<string, Promise<HTMLImageElement>>()

  constructor(private readonly resolve: (name: string) => string | undefined = assetUrl) {}

  get(name: string): HTMLImageElement | undefined {
    return this.cache.get(name)
  }

  load(name: string): Promise<HTMLImageElement> {
    const cached = this.cache.get(name)
    if (cached) return Promise.resolve(cached)

    const existing = this.inFlight.get(name)
    if (existing) return existing

    const url = this.resolve(name)
    if (!url) {
      return Promise.reject(new Error(`No such drawable: ${name}`))
    }

    const pending = new Promise<HTMLImageElement>((resolvePromise, reject) => {
      const img = new Image()
      img.onload = () => {
        this.cache.set(name, img)
        this.inFlight.delete(name)
        resolvePromise(img)
      }
      img.onerror = () => {
        this.inFlight.delete(name)
        // Reject rather than hang: a pending promise would strand the game on a loading screen.
        reject(new Error(`Failed to load drawable: ${name}`))
      }
      img.src = url
    })

    this.inFlight.set(name, pending)
    return pending
  }

  async preload(names: readonly string[]): Promise<void> {
    await Promise.all(names.map((n) => this.load(n)))
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rendering/ImageAssetManager.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add ImageAssetManager with async preloading"
```

---

### Task 12: Canvas renderers

**Files:**
- Create: `src/rendering/RoomRenderer.ts`, `src/rendering/MinimapRenderer.ts`, `src/rendering/RoomTreasure.ts`

**Interfaces:**
- Consumes: `RoomGeometry`, `ImageAssetManager`, `PlacementMap`, `CharacterCatalog`, `ExitLayout`, models.
- Produces:
  - `drawRoom(ctx, opts: { room, layout, inventory, coinsCollected, score, elapsedMillis, width, height, lock, images }): void`
  - `drawMinimap(ctx, opts: { maze, currentRoomId, visitedRoomIds, width, height, images }): void`
  - `roomTreasureFor(room): TreasureSprite | null` (port of `RoomTreasure.kt`)

Read `RoomRenderer.kt` (304 lines), `MinimapRenderer.kt` (218), and `RoomTreasure.kt` (140) before starting. Translation table:

| Android | Canvas 2D |
|---|---|
| `canvas.drawBitmap(b, srcRect, dstRect, paint)` | `ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)` |
| `Paint().apply { textSize = 64f }` | `ctx.font = '64px <family>'` |
| `Paint.Align.CENTER` | `ctx.textAlign = 'center'` |
| `setShadowLayer(6f, 0f, 2f, BLACK)` | `ctx.shadowBlur = 6; ctx.shadowOffsetY = 2; ctx.shadowColor = '#000'` |
| `paint.alpha = 110` | `ctx.globalAlpha = 110 / 255` |
| `canvas.drawRect(r, paint)` | `ctx.fillRect(x, y, w, h)` |
| `Color.WHITE` | `'#fff'` |

Keep the fraction constants exactly: `TREASURE_HEIGHT_FRACTION = 0.13`, `KEY_HEIGHT_FRACTION = 0.20`, `WINDLASS_HEIGHT_FRACTION = 0.34`, `WINDLASS_X = 0.50`, `WINDLASS_FEET_Y = 0.86`.

Backdrops are drawn **center-cropped (cover), never stretched** — the doc comment explains that stretching squashed each asset by a different factor and distorted door shape. Compute the source rect with `RoomGeometry.visibleWidthFraction`/`visibleHeightFraction` so drawing and hit-testing share one projection.

- [ ] **Step 1: Write `RoomTreasure.ts`**

Port `RoomTreasure.kt`, which decides which treasure sprite a room shows and what it is worth.
Port `RoomTreasureTest.kt` with it.

**Do not reimplement its `hash`/`bucket`.** `RoomTreasure.kt` carries a byte-identical copy of the
32-bit avalanche in `PlacementMap.kt`; Task 10 extracted it to `src/rendering/hash.ts`. Import
`avalanche`, `bucket`, and `floorMod` from there. Writing it again in plain JS `*` arithmetic
would not wrap at 32 bits and would hand back different buckets — moving treasure sprites between
rooms and failing `RoomTreasureTest`.

- [ ] **Step 2: Run the RoomTreasure test**

Run: `npx vitest run tests/rendering/RoomTreasure.test.ts`
Expected: PASS.

- [ ] **Step 3: Write `MinimapRenderer.ts`**

Port `MinimapRenderer.kt`. It draws only visited rooms, hides cells outside the maze, and marks an uncollected key (commit `7813a7a`). No unit test — verified visually in Task 15.

- [ ] **Step 4: Write `RoomRenderer.ts`**

Port `RoomRenderer.kt`: backdrop (cover-scaled), character sprite, pickups, treasure, windlass, door overlays, HUD. Take `width`/`height` as explicit arguments, as the Kotlin version already does.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: port the room and minimap renderers to canvas"
```

---

### Task 13: Persistence

**Files:**
- Create: `src/persistence/GameStateStore.ts`, `src/persistence/SettingsStore.ts`, `src/persistence/QuestionBank.ts`, `src/persistence/QuestionStore.ts`, `src/persistence/SavedGame.ts`, `src/types/window.d.ts`
- Modify: `electron/main.ts`, `electron/preload.ts`
- **Already exists — do not recreate:** `src/persistence/serialization.ts` and `tests/persistence/serialization.test.ts` were created by Task 7, which needed the round-trip for its own suite. Extend the file if your stores need a field it does not yet carry; otherwise consume it as-is.
- Test: `tests/persistence/SettingsStore.test.ts`, `tests/persistence/QuestionBank.test.ts`

**Interfaces:**
- Consumes: engine models, `GameState`.
- Produces:
  - `serializeGameState(state: GameState): string`, `deserializeGameState(json: string): GameState`
  - `interface SavedGame { state: GameState; entryDirection: Direction | null }`
  - `GameStateStore` — `saveActive`, `loadActive`, `clearActive`, `saveCrossSession`, `loadCrossSession`, `clearSaved`
  - `SettingsStore` — `save`, `load`, `musicEnabled`, `setMusicEnabled`
  - `window.mindmaze` bridge API

**Serialization note:** `GameState` holds `Set` and `Map`, which `JSON.stringify` turns into `{}`. `serializeGameState` converts them to arrays and `deserializeGameState` restores them. This is why the serialisation test lives here.

- [ ] **Step 1: Confirm the Task 7 serialization round-trip still passes**

`src/persistence/serialization.ts` and its test already exist (Task 7). Run them before building
the stores on top, so a later failure is attributable to the stores rather than the serialiser:

Run: `npx vitest run tests/persistence/serialization.test.ts`
Expected: PASS. If it fails, stop and report — the engine phase is supposed to have left it green.

For reference, the suite it must satisfy:

```ts
// tests/persistence/serialization.test.ts
import { describe, it, expect } from 'vitest'
import { serializeGameState, deserializeGameState } from '@/persistence/serialization'
import { door, gate, makeRoom, PICKUP_COIN, PICKUP_KEY } from '@/engine/model/Room'
import type { GameState } from '@/engine/model/GameState'

const sample: GameState = {
  maze: {
    rooms: new Map([
      [0, makeRoom(0, new Map([['NORTH', door('OPEN')], ['EAST', gate('g1', true)]]), PICKUP_COIN)],
      [10, makeRoom(10, new Map([['SOUTH', { type: 'Absent' }]]), PICKUP_KEY)],
    ]),
    gatePairs: new Map([['g1', { id: 'g1', openRoomId: 0, openDirection: 'EAST' }]]),
    startId: 0,
    treasureId: 10,
    treasureLock: { type: 'Barred', windlassRoomIds: new Set([3, 7]), completed: new Set([3]) },
  },
  currentRoomId: 0,
  visitedRoomIds: new Set([0]),
  inventory: { keys: 1, hints: 2 },
  coinsCollected: 3,
  treasureBonus: 0,
  windlassProgress: new Map([[3, 2]]),
  correctAnswers: 5,
  elapsedMillis: 12345,
  settings: {
    topics: new Set(['MATH', 'HISTORY']),
    difficulty: 'KINDERGARTEN',
    complexity: 'MEDIUM',
  },
  isComplete: false,
}

describe('GameState serialization', () => {
  it('round-trips through JSON', () => {
    const back = deserializeGameState(serializeGameState(sample))
    expect(back).toEqual(sample)
  })

  it('restores Sets and Maps as real collections, not plain objects', () => {
    // JSON.stringify turns a Map into {} — the bug this converter exists to prevent.
    const back = deserializeGameState(serializeGameState(sample))
    expect(back.maze.rooms).toBeInstanceOf(Map)
    expect(back.visitedRoomIds).toBeInstanceOf(Set)
    expect(back.windlassProgress).toBeInstanceOf(Map)
    expect(back.settings.topics).toBeInstanceOf(Set)
    expect(back.maze.rooms.get(0)!.exits).toBeInstanceOf(Map)
  })

  it('preserves the Barred treasure lock sets', () => {
    const back = deserializeGameState(serializeGameState(sample))
    const lock = back.maze.treasureLock
    expect(lock.type).toBe('Barred')
    if (lock.type === 'Barred') {
      expect([...lock.windlassRoomIds].sort()).toEqual([3, 7])
      expect([...lock.completed]).toEqual([3])
    }
  })
})
```

- [ ] **Step 2: Write the stores**

`SettingsStore` keeps its Kotlin defaults exactly: `KINDERGARTEN`, `SIMPLE`, all topics, `musicEnabled = true`. Carry the doc comment explaining why `musicEnabled` is not in `GameSettings` — it is a UI preference and has no business in the engine's save format.

`GameStateStore` keeps `saveActive`/`loadActive`/`clearActive`/`saveCrossSession`/`loadCrossSession`/`clearSaved`, and the legacy fallback: if a file does not parse as `SavedGame`, retry as a bare `GameState` and adopt it with `entryDirection: null`. Without it an upgrade throws on launch and strands the player's game.

- [ ] **Step 3: Fill in `electron/preload.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'

export interface MindMazeBridge {
  loadActive(): Promise<string | null>
  saveActive(json: string): Promise<void>
  clearActive(): Promise<void>
  loadSaved(): Promise<string | null>
  saveSaved(json: string): Promise<void>
  clearSaved(): Promise<void>
  loadSettings(): Promise<string | null>
  saveSettings(json: string): Promise<void>
  loadCustomQuestions(): Promise<string | null>
  saveCustomQuestions(json: string): Promise<void>
}

const bridge: MindMazeBridge = {
  loadActive: () => ipcRenderer.invoke('store:read', 'game_state.json'),
  saveActive: (json) => ipcRenderer.invoke('store:write', 'game_state.json', json),
  clearActive: () => ipcRenderer.invoke('store:delete', 'game_state.json'),
  loadSaved: () => ipcRenderer.invoke('store:read', 'saved_game.json'),
  saveSaved: (json) => ipcRenderer.invoke('store:write', 'saved_game.json', json),
  clearSaved: () => ipcRenderer.invoke('store:delete', 'saved_game.json'),
  loadSettings: () => ipcRenderer.invoke('store:read', 'settings.json'),
  saveSettings: (json) => ipcRenderer.invoke('store:write', 'settings.json', json),
  loadCustomQuestions: () => ipcRenderer.invoke('store:read', 'custom_questions.json'),
  saveCustomQuestions: (json) => ipcRenderer.invoke('store:write', 'custom_questions.json', json),
}

contextBridge.exposeInMainWorld('mindmaze', bridge)
```

- [ ] **Step 4: Add the IPC handlers to `electron/main.ts`**

The filename allowlist matters: it is what stops a compromised renderer from using the bridge to read or write anywhere on disk.

```ts
import { app, ipcMain } from 'electron'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'

const ALLOWED_FILES = new Set([
  'game_state.json',
  'saved_game.json',
  'settings.json',
  'custom_questions.json',
])

const resolveStorePath = (name: string): string => {
  if (!ALLOWED_FILES.has(name)) throw new Error(`Refusing to access ${name}`)
  return path.join(app.getPath('userData'), name)
}

ipcMain.handle('store:read', async (_e, name: string) => {
  try {
    return await readFile(resolveStorePath(name), 'utf-8')
  } catch {
    return null
  }
})

ipcMain.handle('store:write', async (_e, name: string, json: string) => {
  await writeFile(resolveStorePath(name), json, 'utf-8')
})

ipcMain.handle('store:delete', async (_e, name: string) => {
  try {
    await unlink(resolveStorePath(name))
  } catch {
    // Already gone is success.
  }
})
```

Add `src/types/window.d.ts` declaring `interface Window { mindmaze: MindMazeBridge }`.

- [ ] **Step 5: Write and run the store tests**

`SettingsStore` and `QuestionBank` tests inject a fake bridge (an in-memory `Map<string, string>`), so they need no Electron.

Run: `npx vitest run tests/persistence/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add persistence over a sandboxed preload bridge"
```

---

### Task 14: React screens and input

**Files:**
- Create: `src/react/GameHost.tsx`, `src/react/useGame.ts`, `src/react/screens/MenuScreen.tsx`, `src/react/screens/MenuBackdrop.tsx`, `src/react/screens/GameScreen.tsx`, `src/react/screens/TriviaDialog.tsx`, `src/react/screens/ResultsScreen.tsx`, `src/react/screens/MessageDialog.tsx`, `src/react/screens/QuestionsScreen.tsx`, `src/react/styles.css`, `src/audio/MusicPlayer.ts`
- Modify: `src/react/App.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2-13.
- Produces: the running app.

`useGame` is the hook that owns a `GameEngine`, the current `UiState`, and a `dispatch(action: PlayerAction)` that calls the engine, folds the events through `reduce`, and stores the result. It is the direct counterpart of `GameViewModel.kt` — read that before writing it.

- [ ] **Step 1: Write `useGame.ts`**

It must:
- hold `GameEngine` and `TriviaRepository` instances in a ref
- expose `uiState` and `dispatch`
- map each `PlayerAction` to the matching engine call, then `reduce(current, events, engine.getState(), action)`
- record `entryDirection` as `opposite(movedDirection)` after each move, matching `GameViewModel`
- autosave to `saveActive` after every state change
- tick `elapsedMillis` on a 1-second interval while `InGame`

- [ ] **Step 2: Write `GameHost.tsx` (the canvas host)**

- a `<canvas>` sized to a fixed internal resolution, scaled by CSS, multiplied by `devicePixelRatio`
- on each `uiState` change, call `drawRoom` and `drawMinimap`
- `onClick`: convert client coords to canvas fractions, then use `RoomGeometry.tapBoundaries` to decide which door was clicked — **the same projection used to draw**
- `onKeyDown`: arrows/WASD → `Move`/`AttemptDoor`, `A`-`D` → `SubmitAnswer`, `Esc` → dismiss, `H` → `UseHint`, `K` → `UseKey`

- [ ] **Step 3: Write the six screens**

Port each Compose screen to a React component, reusing the parchment styling assets (`ui_panel_tile`, `ui_answer_plate`, `ui_corner_flourish`). Keep every user-facing string identical.

Port `MenuBackdrop.kt` (46 lines) alongside `MenuScreen`: it picks the menu backdrop from
`menu_gate_drawbridge`, `menu_gate_courtyard`, and `menu_gate_towers`. Port `MenuBackdropTest.kt`
with it if its assertions do not depend on Android resource lookup; otherwise assert the chosen
name is one of the three and that `hasAsset` resolves it.

- [ ] **Step 4: Write `src/audio/MusicPlayer.ts`**

Port `audio/MusicPlayer.kt`, backed by an `<audio>` element rather than Android's MediaPlayer.

```ts
import { MUSIC_URL } from '../rendering/assetManifest'

/**
 * Background music, gated on the player's musicEnabled setting.
 *
 * Chromium blocks autoplay until the page has had a user gesture, so play() is called from the
 * first click rather than at load: starting it any earlier fails silently and the music never
 * begins. Looped, because the track is a couple of minutes and a game runs longer.
 */
export class MusicPlayer {
  private audio: HTMLAudioElement | null = null
  private enabled = true

  setEnabled(on: boolean): void {
    this.enabled = on
    if (!on) this.stop()
  }

  /** Safe to call on every click; it only starts playback once. */
  start(): void {
    if (!this.enabled || this.audio) return
    const audio = new Audio(MUSIC_URL)
    audio.loop = true
    audio.volume = 0.4
    // A rejected play() is normal when no gesture has landed yet — try again on the next click.
    void audio.play().catch(() => { this.audio = null })
    this.audio = audio
  }

  stop(): void {
    this.audio?.pause()
    this.audio = null
  }
}
```

Wire it in `App.tsx`: construct one instance, call `setEnabled` from the settings value, and
call `start()` from the app's first click handler.

- [ ] **Step 5: Wire `App.tsx`**

Switch on `uiState.type` and render the matching screen. Show a loading state until `ImageAssetManager.preload` resolves.

- [ ] **Step 6: Run the app and play it**

Run: `npm run dev`

Verify by hand:
- the menu opens and a game starts
- rooms render with backdrop, doors, and minimap
- clicking a door opens a trivia question; a correct answer moves you through
- a wrong answer keeps the door shut
- pickups are clickable; the HUD updates
- keyboard alone can play a full turn
- the window resizes without misaligning doors

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add React screens, menu backdrop, music, and input"
```

---

### Task 15: Verify the port against the Android build

**Files:**
- Create: `docs/verification.md`

No new features. This task is where the port is checked against what it was ported from, and it is deliberately separate so it cannot be skipped as "part of" a feature task.

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: every suite green. Record the count.

Run: `npm run typecheck` and `npm run check-assets`
Expected: both exit 0.

- [ ] **Step 2: Play a full game at each complexity**

For SIMPLE, MEDIUM, and HARD: start a game, reach the treasure, confirm the results screen totals. On MEDIUM confirm the treasure door is locked and a key opens it; on HARD confirm two windlass chambers bar it and three correct answers raise each.

- [ ] **Step 3: Compare rendering side by side**

Screenshot the same room type in both builds (the Android app can run in an emulator, or use `../mindmaze/samples/*.png`). Check door alignment, sprite scale, and HUD placement. Note any differences in `docs/verification.md`, with a judgement on whether each is cosmetic or a real drift.

- [ ] **Step 4: Verify music**

Confirm music starts on the first click rather than at load, loops, and stops when the setting
is turned off. Confirm the setting survives a relaunch.

- [ ] **Step 5: Verify persistence**

Start a game, quit mid-maze, relaunch: the game resumes in the same room facing the same way. Change settings, relaunch: they persist. Confirm the files exist under `app.getPath('userData')`.

- [ ] **Step 6: Write `docs/verification.md`**

Record test counts, what was played, screenshot comparisons, and every known difference from the Android build — including the preserved mid-trivia save quirk.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: record verification of the port against the Android build"
```

---

### Task 16: Packaging and CI

**Files:**
- Create: `electron-builder.yml`, `.github/workflows/build.yml`, `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: a working app (Tasks 1-15).
- Produces: `npm run dist` artifacts, and a CI workflow that builds the macOS `.dmg`.

**Constraint:** the macOS artifact cannot be built or verified on this Linux machine, and the developer's only Mac is a work machine. The workflow must be self-sufficient — no step may assume a local macOS checkout.

- [ ] **Step 1: Write `electron-builder.yml`**

```yaml
appId: com.mindmaze.desktop
productName: MindMaze
directories:
  output: release
  buildResources: build
files:
  - dist/**/*
  - dist-electron/**/*
mac:
  target:
    - target: dmg
      arch: [x64, arm64]
  category: public.app-category.games
  # Unsigned: family distribution does not justify a $99/yr Developer ID.
  # First launch needs right-click -> Open. Documented in the README.
  identity: null
win:
  target:
    - target: nsis
      arch: [x64]
linux:
  target: [AppImage]
  category: Game
```

Add scripts: `"dist": "npm run build && electron-builder"`, `"dist:linux": "... --linux"`, `"dist:win": "... --win"`, `"dist:mac": "... --mac"`.

`dist:mac` is defined for completeness only; it is not part of the documented local workflow.

- [ ] **Step 2: Build and verify the Linux artifact**

```bash
npm install --save-dev electron-builder
npm run dist:linux
ls -la release/
```

Expected: an `.AppImage` is produced. Run it and confirm the app opens.

- [ ] **Step 3: Write `.github/workflows/build.yml`**

```yaml
name: Build

on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run check-assets
      - run: npm test

  build:
    needs: test
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: macos-latest
            script: dist:mac
          - os: windows-latest
            script: dist:win
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run ${{ matrix.script }}
      - uses: actions/upload-artifact@v4
        with:
          name: mindmaze-${{ matrix.os }}
          path: |
            release/*.dmg
            release/*.exe

  release:
    needs: build
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v4
        with: { path: artifacts }
      - uses: softprops/action-gh-release@v2
        with:
          files: artifacts/**/*
          body: |
            Download the installer for your machine.

            **macOS:** open the `.dmg`, drag MindMaze to Applications. The first launch
            needs a right-click on the app and then "Open" — the app is unsigned, so
            double-clicking shows a warning instead.

            **Windows:** run the `.exe`. Windows SmartScreen shows a warning once;
            choose "More info" and then "Run anyway".
```

`fail-fast: false` matters: a Windows failure should not cancel the macOS job, since macOS is the one that cannot be re-run locally.

- [ ] **Step 4: Write the README**

Cover: what the app is, how to run it in development, how to run the tests, how to build each platform, where the macOS build comes from and why, and the unsigned first-launch steps for both platforms.

- [ ] **Step 5: Verify the workflow is well-formed**

Run: `npx --yes @action-validator/cli .github/workflows/build.yml` (or inspect by hand — it cannot be executed locally).
Expected: no syntax errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add packaging config and the CI build workflow"
```

- [ ] **Step 7: Hand off to the user**

The repo is ready to push. Tell them:
1. Create an empty GitHub repo (private is fine).
2. `git remote add origin <url> && git push -u origin main`
3. `git tag v1.0.0 && git push --tags` to trigger the build.
4. The `.dmg` and `.exe` land on the Releases page.

---

## Notes for the executor

**Read the Kotlin before porting each file.** The doc comments record bugs already fixed — the door-geometry drift, the maze-shattering generator, the 149-second windlass solve. Porting without reading them risks reintroducing exactly those bugs.

**Carry the comments, not just the code.** Task 2 transcribed every type shape correctly and still lost `TreasureLock`'s rationale — including the note that reset-to-zero was a deliberate choice, the arithmetic behind it (75% answer rate → ~42% chance of three in a row → ~2.4 attempts per windlass), and the fact that flipping the flag is the tuning lever if play proves frustrating. Shapes are recoverable from the Kotlin; *reasoning* is not, and a constant with no comment reads as arbitrary to whoever touches it next. When a Kotlin declaration carries a comment explaining **why**, that comment is part of what you are porting — reviewers are expected to flag its absence.

**Never modify anything under `../mindmaze/`.** It is the reference, and it still has to build and run for Android.

**When Kotlin looks wrong, port it as-is and note it.** The Android app ships and is played. A behaviour change smuggled into a port is the hardest kind of bug to find later, because both sides look correct in isolation.

**If a ported test fails, suspect the port before the test.** These tests pass against Kotlin today. A failure is evidence of a translation error until proven otherwise.
