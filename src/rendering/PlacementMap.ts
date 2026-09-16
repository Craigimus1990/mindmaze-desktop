import { avalanche, floorMod } from './hash'

/**
 * Where each character stands in each room, hand-authored rather than computed.
 *
 * ## Why this replaced computed placement
 *
 * The previous CharacterPlacement derived a position: pick a compass wall with no exit, project
 * it through the current ExitLayout, and mirror the sprite to face the room's centre. That was
 * correct about doors and ignorant of everything else — it had no idea a given backdrop puts a
 * table at 0.7, a fireplace at 0.85, or a rug across the middle, so characters stood in front of
 * furniture and in the approach to doorways.
 *
 * Positions now come from `character_placements.json`, authored in `tools/placement_editor.py`
 * against the actual artwork. Mirroring is authored too: the editor's flip control writes
 * `Placement.flip`, so a character faces whichever way looks right in that specific room rather
 * than whichever way a rule inferred.
 *
 * ## Alternatives, not a scene
 *
 * A room's entries are alternatives. Exactly one is drawn, chosen by room id — so a room keeps its
 * inhabitant across save/reload and across a re-render, while different rooms sharing a backdrop
 * show different characters. Overlapping entries are therefore fine and expected; they are never
 * on screen together.
 */

export interface Placement {
  readonly character: string
  readonly x: number
  readonly feetY: number
  readonly height: number
  readonly flip: boolean
}

export type PlacementFile = Readonly<Record<string, readonly Placement[]>>

const isPlacementShaped = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return (
    typeof p.character === 'string' &&
    p.character.trim() !== '' &&
    typeof p.x === 'number' &&
    typeof p.feetY === 'number' &&
    typeof p.height === 'number' &&
    (p.flip === undefined || typeof p.flip === 'boolean')
  )
}

const toPlacement = (v: Record<string, unknown>): Placement => ({
  character: v.character as string,
  x: v.x as number,
  feetY: v.feetY as number,
  height: v.height as number,
  flip: v.flip === true,
})

export const PlacementMap = {
  /**
   * Parses the shipped placement map. Never throws — a malformed map means no characters, not
   * a crash: they are decoration, and the game is entirely playable without them. This is
   * deliberately different from the questions bank, which throws on bad data because a bad
   * `correctIndex` silently locks every door in the maze; a bad placement just means an empty
   * room, which is already a state the game handles.
   *
   * A cast is not a parse: every field is validated rather than asserted, and individual
   * malformed entries are dropped rather than poisoning the whole room's list.
   */
  parse(text: string): PlacementFile {
    try {
      const data: unknown = JSON.parse(text)
      if (typeof data !== 'object' || data === null) return {}
      const placements = (data as Record<string, unknown>).placements
      if (typeof placements !== 'object' || placements === null || Array.isArray(placements)) {
        return {}
      }

      const result: Record<string, Placement[]> = {}
      for (const [room, rawEntries] of Object.entries(placements as Record<string, unknown>)) {
        if (!Array.isArray(rawEntries)) continue
        const entries = rawEntries.filter(isPlacementShaped).map(toPlacement)
        if (entries.length > 0) result[room] = entries
      }
      return result
    } catch {
      // A malformed map means no characters, not a crash: they are decoration, and the game
      // is entirely playable without them.
      return {}
    }
  },

  /**
   * Fraction of rooms that host a character.
   *
   * Needed because every shipped backdrop now has placements authored, so without a gate every
   * single room would be occupied — measured at 10.75 characters across a ~10.8-room SIMPLE
   * path, i.e. 100%. At that point they stop reading as inhabitants and become wallpaper.
   *
   * This replaces the old "two or fewer exits" rule, which was never really about density: it
   * assumed a character needed a doorless wall to stand against, which stopped being true once
   * positions were hand-authored. It also had a bad interaction with the maze navigability fix
   * — adding loops meant most rooms gained a third exit, which dropped SIMPLE to 0.56
   * characters per run and made the easiest tier the emptiest.
   */
  DENSITY: 0.5,

  BUCKETS: 1024,

  /**
   * The character for a room, or null if none is authored or the room is one of the empty ones.
   *
   * Keyed on `roomId` rather than random so the choice is stable for the whole game and across
   * save/reload — room ids are persisted, so nothing extra needs storing. floorMod because a
   * negative id would otherwise throw off indexing.
   */
  forRoom(map: PlacementFile, assetName: string, roomId: number): Placement | null {
    const entries = map[assetName]
    if (!entries || entries.length === 0) return null
    if (!PlacementMap.isPopulated(roomId)) return null

    // Pick the CHARACTER by room id, then find that character's placement in this config —
    // rather than indexing into this config's list directly. The two differ when the player
    // turns around: the config changes with facing, so indexing per-config would hand back a
    // different character for the same room. Selecting the character first and looking up its
    // position second keeps the inhabitant stable while the position follows the artwork.
    const cast = [...new Set(entries.map((e) => e.character))].sort()
    const chosen = cast[floorMod(avalanche(roomId, 0x7f4a), cast.length)]
    // The character has no placement authored for this particular config. Showing a
    // different one would reintroduce exactly the swap this avoids, so show nobody.
    return entries.find((e) => e.character === chosen) ?? null
  },

  /** Whether this room hosts anyone at all. Exposed for tests; stable for a given id. */
  isPopulated(roomId: number): boolean {
    return (
      floorMod(avalanche(roomId, 0x9e37), PlacementMap.BUCKETS) <
      Math.trunc(PlacementMap.DENSITY * PlacementMap.BUCKETS)
    )
  },
}
