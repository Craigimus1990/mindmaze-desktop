# Design notes

Choices in this codebase that look arbitrary but are not. Each records what would break if someone
"simplified" it later. For what was tested and how the port differs from the Android build, see
[verification.md](verification.md).

## The 32-bit hash must use `Math.imul`

`src/rendering/hash.ts` implements an integer avalanche that decides which character stands in a
room and which treasure sprite it holds. The Kotlin original relies on `Int` arithmetic wrapping at
32 bits; JavaScript numbers are 64-bit floats and do not wrap, and `>>` sign-extends where Kotlin's
`ushr` does not.

Written with plain `*` and `>>`, the function still returns plausible numbers — it just returns
*different* ones, silently reassigning characters and treasure to different rooms than the Android
build shows. `Math.imul` and `>>>` reproduce Kotlin exactly; this was verified value-by-value
against an independent implementation. `PlacementMap` and `RoomTreasure` both import from the one
helper rather than each keeping a copy, because Kotlin kept two copies and they could drift.

## Room themes key on room id, never on door configuration

`src/rendering/backdropName.ts`. A room's exit configuration changes as the player turns around —
the same room reads as `room_with_left` from one side and `room_with_center_right` from the other.
Picking a theme from the configuration therefore made a room change its decor *and its inhabitant*
purely because the player backtracked. Keying on the persisted room id keeps both stable across a
turn and across save/reload, without storing anything extra.

## Hit-testing and drawing share one projection

`src/rendering/RoomGeometry.ts` is the single source of truth for where doors are. Backdrops are
centre-cropped ("cover") rather than stretched, which moves door positions relative to the pane, so
`projectX`/`projectY` map authored source fractions onto screen fractions. Both the renderer and
the click handler go through those functions.

Door geometry was previously hardcoded in three places that drifted apart, leaving labels floating
above and inboard of the doors they described — and, as the original comment puts it, "nothing
failed a test because nothing tested it." Any code that computes a door position without this
projection reintroduces that bug.

## Three JSON sources, three deliberate failure policies

| Source | On malformed input | Why |
|---|---|---|
| `questions.json` | **throws** | A bad `correctIndex` means no answer is ever correct: every door stays shut and a child is told they are wrong when they are right. Fail loudly at load. |
| `character_placements.json` | degrades to empty | Characters are decoration. A malformed file must not stop the game being playable. |
| save files | degrade to `null` | Throwing would strand a player's game on launch. A legacy-format retry also reads saves written before `entryDirection` existed. |

A bare `JSON.parse(x) as T` is an assertion, not a parse — TypeScript erases it and bad data flows
on silently. Where the table says *throws*, the shape is validated and the error names the offending
record and field.

## The renderer never touches the filesystem

All file access goes through a preload bridge with a four-filename allowlist in the main process
(`electron/main.ts`), with `contextIsolation`, `sandbox` on and `nodeIntegration` off. `vite-plugin-
electron-renderer` is deliberately absent: it exists to let renderer code import Node built-ins,
which is the opposite of what this architecture wants.

## Pickups are tapped, not collected automatically

Coins, jewels and keys are drawn in the room and collected by clicking them. Hints still collect on
entry, because they have no artwork of their own. The key especially is drawn where the eye goes,
because it is the one pickup a player must not miss — finding it should be something the player
does, not something that happens to them while walking past.

## Local runs need `--no-sandbox`; the app's own sandbox stays on

Electron's `chrome-sandbox` helper inside `node_modules` is not installed root-owned, which npm
cannot fix, so a local launch may need `--no-sandbox` as a **launcher** flag. That is a file
permission quirk of running from `node_modules`. It is not the `sandbox: true` webPreference in
`electron/main.ts`, which must never be relaxed to work around it. Packaged builds ship a correctly
permissioned helper and are unaffected.
