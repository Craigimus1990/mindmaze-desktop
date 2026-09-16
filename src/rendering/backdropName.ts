import type { Direction } from '../engine/model/Direction'
import type { ExitType } from '../engine/model/Room'
import { forEntry, type ExitLayout } from '../util/ExitLayout'
import { floorMod } from './hash'

/**
 * Which of the eight base backdrops a room shows, from the exits actually reachable from the
 * screen's three door slots.
 *
 * `layout` follows the player's facing (see {@link ExitLayout}), so the same room can legitimately
 * report a different base name depending on which way the player entered from.
 */
export const assetName = (
  exits: ReadonlyMap<Direction, ExitType>,
  layout: ExitLayout = forEntry(null),
): string => {
  const live = (d: Direction): boolean => {
    const e = exits.get(d)
    return e !== undefined && e.type !== 'Absent'
  }
  const hasLeft = live(layout.left)
  const hasCenter = live(layout.center)
  const hasRight = live(layout.right)

  if (hasLeft && hasCenter && hasRight) return 'room_with_left_center_right'
  if (hasLeft && hasCenter) return 'room_with_left_center'
  if (hasLeft && hasRight) return 'room_with_left_right'
  if (hasCenter && hasRight) return 'room_with_center_right'
  if (hasLeft) return 'room_with_left'
  if (hasCenter) return 'room_with_center'
  if (hasRight) return 'room_with_right'
  return 'room_deadend'
}

/**
 * Every theme, each of which has art for all eight door configurations.
 *
 * Completeness is load-bearing, not tidiness. A room's *config* depends on which way the player
 * is facing — {@link ExitLayout} rotates left/center/right with the entry direction — so one room
 * can legitimately render as `room_with_left` on the way in and `room_with_center_right` on the
 * way back. If a theme lacked art for the second config, the room would visibly change decor when
 * the player turned around.
 *
 * The coverage used to be sparse on purpose (4-5 themes per config), which made that impossible to
 * avoid: 12 of the 15 possible exit sets had no single theme available across all the configs they
 * could present.
 */
const THEMES: readonly string[] = [
  'stone_corridor', 'great_library', 'alchemy_study', 'map_room', 'armory',
  'astronomer_tower', 'great_hall', 'cellar_vault', 'chapel', 'music_room',
  'garden_courtyard',
]

/**
 * The theme a room is decorated in, derived from `roomId` alone.
 *
 * Deliberately independent of the door configuration. The config changes as the player turns
 * around — the same room reads as `room_with_left` from one side and `room_with_center_right`
 * from the other — so selecting the theme from a per-config list meant a room changed decor (and
 * its inhabitant, which is keyed off the backdrop) purely because the player backtracked.
 *
 * Keyed on the persisted room id, so the theme is stable for the whole game and across
 * save/reload without storing anything. `floorMod` because a negative id would otherwise throw.
 */
export const themeFor = (roomId: number): string | null => {
  if (THEMES.length === 0) return null
  return THEMES[floorMod(roomId, THEMES.length)] ?? null
}

/**
 * Picks a themed backdrop for a room, or falls back to the unthemed placeholder.
 *
 * Keyed on roomId rather than random so a room keeps its look for the whole game — and across
 * save/reload, since room ids are stable and persisted. Deriving it this way avoids adding a
 * `theme` field to the engine's `Room` and changing the save format.
 *
 * Returns `base` unchanged when no theme covers that configuration, which keeps the eight
 * placeholder drawables as a working fallback rather than showing a wall where a door is.
 */
export const themedAssetName = (base: string, roomId: number): string => {
  const theme = themeFor(roomId)
  if (theme === null) return base
  return `${base}_${theme}`
}
