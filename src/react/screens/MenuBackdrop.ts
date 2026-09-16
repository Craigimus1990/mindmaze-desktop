import { floorMod } from '../../rendering/hash'

/**
 * Which castle gate the main menu shows, chosen once per app launch.
 *
 * Scoped to the *module*, not the component. A `useMemo` inside MenuScreen would re-roll whenever
 * the component remounts — and the menu is mounted and unmounted every time the player returns
 * from a game — so the gate would visibly swap mid-session. A module-level constant is evaluated
 * once when the renderer process loads its bundle and stays fixed until the window is reloaded,
 * which is precisely the "new gate on relaunch, same gate while playing" behaviour wanted here.
 *
 * (Kotlin scoped this to the Android *process* for the same reason, where the hazard was
 * Activity recreation on rotation rather than a React remount.)
 *
 * Seeded from the launch timestamp rather than a fixed key: there is nothing about the menu
 * (unlike the results screen, which has a score) that varies per visit on its own.
 */

/**
 * The gates available to the rotation.
 *
 * All three are drawn to the same brief — gate right-of-centre, calm left third — because
 * MenuScreen lays its controls down the left under a left-weighted scrim. Art without that
 * calm band would put the menu text over busy detail.
 */
export const GATES: readonly string[] = [
  'menu_gate_drawbridge',
  'menu_gate_courtyard',
  'menu_gate_towers',
]

/**
 * Index into {@link GATES} for a given launch timestamp.
 *
 * Split out from {@link current} so the selection is testable without a module reload or any
 * asset lookup. floorMod because a caller could hand this a negative clock value.
 */
export const indexFor = (timestampMillis: number): number => floorMod(timestampMillis, GATES.length)

/**
 * The gate for this launch. Resolved once, at module evaluation, and stable from then until the
 * renderer is reloaded.
 */
export const current: string = GATES[indexFor(Date.now())]!
