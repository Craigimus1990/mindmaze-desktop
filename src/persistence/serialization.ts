import type { Direction } from '@/engine/model/Direction'
import type { GameState } from '@/engine/model/GameState'
import type { Maze, TreasureLock } from '@/engine/model/Maze'
import type { ExitType, Pickup, Room } from '@/engine/model/Room'
import type {
  Complexity,
  Difficulty,
  DoorState,
  GameSettings,
  GatePair,
  Inventory,
  Topic,
} from '@/engine/model/types'

/**
 * JSON save format for GameState.
 *
 * Kotlin got this for free: kotlinx.serialization writes a Map as a JSON object and a Set as a
 * JSON array, and reads them back into the right collection types. `JSON.stringify` does neither
 * — it turns a Map or a Set into `{}` and silently loses every entry. So every collection in the
 * tree is converted to an array on the way out and rebuilt on the way in.
 *
 * The collections that need it, and which were all found by this being wrong first:
 *   maze.rooms, each room.exits, maze.gatePairs, maze.treasureLock's two sets when Barred,
 *   visitedRoomIds, windlassProgress, settings.topics.
 *
 * Save-file compatibility with the Android build is a non-goal; this format pins only what this
 * app writes and reads. The version field exists so a future change can migrate rather than
 * silently misread an old save.
 */
const FORMAT_VERSION = 1

interface SerializedRoom {
  readonly id: number
  /** Map<Direction, ExitType> as entry pairs. */
  readonly exits: readonly (readonly [Direction, ExitType])[]
  readonly pickup: Pickup
  readonly buttonGatePairId: string | null
}

type SerializedTreasureLock =
  | { readonly type: 'Open' }
  | { readonly type: 'Locked'; readonly keyRoomId: number }
  | {
      readonly type: 'Barred'
      readonly windlassRoomIds: readonly number[]
      readonly completed: readonly number[]
    }

interface SerializedMaze {
  /** Map<number, Room> as entry pairs. */
  readonly rooms: readonly (readonly [number, SerializedRoom])[]
  /** Map<string, GatePair> as entry pairs. */
  readonly gatePairs: readonly (readonly [string, GatePair])[]
  readonly startId: number
  readonly treasureId: number
  readonly treasureLock: SerializedTreasureLock
}

interface SerializedSettings {
  readonly topics: readonly Topic[]
  readonly difficulty: Difficulty
  readonly complexity: Complexity
}

interface SerializedGameState {
  readonly version: number
  readonly maze: SerializedMaze
  readonly currentRoomId: number
  readonly visitedRoomIds: readonly number[]
  readonly inventory: Inventory
  readonly coinsCollected: number
  readonly treasureBonus: number
  /** Map<number, number> as entry pairs. */
  readonly windlassProgress: readonly (readonly [number, number])[]
  readonly correctAnswers: number
  readonly elapsedMillis: number
  readonly settings: SerializedSettings
  readonly isComplete: boolean
}

// -------------------------------------------------------------------------
// Encode
// -------------------------------------------------------------------------

const encodeRoom = (room: Room): SerializedRoom => ({
  id: room.id,
  exits: [...room.exits],
  pickup: room.pickup,
  buttonGatePairId: room.buttonGatePairId,
})

const encodeLock = (lock: TreasureLock): SerializedTreasureLock =>
  lock.type === 'Barred'
    ? {
        type: 'Barred',
        windlassRoomIds: [...lock.windlassRoomIds],
        completed: [...lock.completed],
      }
    : lock

const encodeMaze = (maze: Maze): SerializedMaze => ({
  rooms: [...maze.rooms].map(([id, room]) => [id, encodeRoom(room)] as const),
  gatePairs: [...maze.gatePairs],
  startId: maze.startId,
  treasureId: maze.treasureId,
  treasureLock: encodeLock(maze.treasureLock),
})

const encodeSettings = (s: GameSettings): SerializedSettings => ({
  topics: [...s.topics],
  difficulty: s.difficulty,
  complexity: s.complexity,
})

export const serializeGameState = (state: GameState): string =>
  JSON.stringify({
    version: FORMAT_VERSION,
    maze: encodeMaze(state.maze),
    currentRoomId: state.currentRoomId,
    visitedRoomIds: [...state.visitedRoomIds],
    inventory: state.inventory,
    coinsCollected: state.coinsCollected,
    treasureBonus: state.treasureBonus,
    windlassProgress: [...state.windlassProgress],
    correctAnswers: state.correctAnswers,
    elapsedMillis: state.elapsedMillis,
    settings: encodeSettings(state.settings),
    isComplete: state.isComplete,
  } satisfies SerializedGameState)

// -------------------------------------------------------------------------
// Decode
// -------------------------------------------------------------------------

/**
 * Fail loudly on a malformed save rather than hand back a half-built GameState.
 *
 * The same reasoning as TriviaRepository's validation: a save that decodes into a maze with no
 * rooms softlocks the game with no error a player could act on, and the cause would be nowhere
 * near the symptom. Checked once at load, so the cost does not matter.
 */
const fail = (what: string): never => {
  throw new Error(`corrupt save: ${what}`)
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const num = (v: unknown, what: string): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fail(`${what} must be a number`)

const str = (v: unknown, what: string): string =>
  typeof v === 'string' ? v : fail(`${what} must be a string`)

const bool = (v: unknown, what: string): boolean =>
  typeof v === 'boolean' ? v : fail(`${what} must be a boolean`)

const arr = (v: unknown, what: string): unknown[] =>
  Array.isArray(v) ? v : fail(`${what} must be an array`)

const obj = (v: unknown, what: string): Record<string, unknown> =>
  isObject(v) ? v : fail(`${what} must be an object`)

/** An encoded Map entry: a two-element array. */
const entry = (v: unknown, what: string): readonly [unknown, unknown] => {
  const e = arr(v, `${what} entry`)
  if (e.length !== 2) fail(`${what} entry must be a [key, value] pair`)
  return [e[0], e[1]]
}

const decodeExit = (v: unknown): ExitType => {
  const o = obj(v, 'exit')
  switch (o.type) {
    case 'Absent':
      return { type: 'Absent' }
    case 'Door':
      return { type: 'Door', state: str(o.state, 'door state') as DoorState }
    case 'Gate':
      return {
        type: 'Gate',
        pairId: str(o.pairId, 'gate pairId'),
        open: bool(o.open, 'gate open'),
      }
    default:
      return fail(`unknown exit type ${JSON.stringify(o.type)}`)
  }
}

const decodePickup = (v: unknown): Pickup => {
  const o = obj(v, 'pickup')
  switch (o.type) {
    case 'None':
    case 'Coin':
    case 'Key':
    case 'Hint':
      return { type: o.type }
    default:
      return fail(`unknown pickup type ${JSON.stringify(o.type)}`)
  }
}

const decodeRoom = (v: unknown): Room => {
  const o = obj(v, 'room')
  const exits = new Map<Direction, ExitType>()
  for (const raw of arr(o.exits, 'room.exits')) {
    const [k, val] = entry(raw, 'room.exits')
    exits.set(str(k, 'exit direction') as Direction, decodeExit(val))
  }
  const button = o.buttonGatePairId
  return {
    id: num(o.id, 'room.id'),
    exits,
    pickup: decodePickup(o.pickup),
    buttonGatePairId: button === null ? null : str(button, 'room.buttonGatePairId'),
  }
}

const decodeLock = (v: unknown): TreasureLock => {
  const o = obj(v, 'treasureLock')
  switch (o.type) {
    case 'Open':
      return { type: 'Open' }
    case 'Locked':
      return { type: 'Locked', keyRoomId: num(o.keyRoomId, 'treasureLock.keyRoomId') }
    case 'Barred':
      return {
        type: 'Barred',
        windlassRoomIds: new Set(
          arr(o.windlassRoomIds, 'treasureLock.windlassRoomIds').map((x) =>
            num(x, 'windlass room id'),
          ),
        ),
        completed: new Set(
          arr(o.completed, 'treasureLock.completed').map((x) => num(x, 'completed room id')),
        ),
      }
    default:
      return fail(`unknown treasureLock type ${JSON.stringify(o.type)}`)
  }
}

const decodeGatePair = (v: unknown): GatePair => {
  const o = obj(v, 'gatePair')
  return {
    id: str(o.id, 'gatePair.id'),
    openRoomId: num(o.openRoomId, 'gatePair.openRoomId'),
    openDirection: str(o.openDirection, 'gatePair.openDirection') as Direction,
  }
}

const decodeMaze = (v: unknown): Maze => {
  const o = obj(v, 'maze')
  const rooms = new Map<number, Room>()
  for (const raw of arr(o.rooms, 'maze.rooms')) {
    const [k, val] = entry(raw, 'maze.rooms')
    rooms.set(num(k, 'room id'), decodeRoom(val))
  }
  const gatePairs = new Map<string, GatePair>()
  for (const raw of arr(o.gatePairs, 'maze.gatePairs')) {
    const [k, val] = entry(raw, 'maze.gatePairs')
    gatePairs.set(str(k, 'gate pair id'), decodeGatePair(val))
  }
  return {
    rooms,
    gatePairs,
    startId: num(o.startId, 'maze.startId'),
    treasureId: num(o.treasureId, 'maze.treasureId'),
    treasureLock: decodeLock(o.treasureLock),
  }
}

const decodeInventory = (v: unknown): Inventory => {
  const o = obj(v, 'inventory')
  return { keys: num(o.keys, 'inventory.keys'), hints: num(o.hints, 'inventory.hints') }
}

const decodeSettings = (v: unknown): GameSettings => {
  const o = obj(v, 'settings')
  return {
    topics: new Set(
      arr(o.topics, 'settings.topics').map((t) => str(t, 'topic') as Topic),
    ),
    difficulty: str(o.difficulty, 'settings.difficulty') as Difficulty,
    complexity: str(o.complexity, 'settings.complexity') as Complexity,
  }
}

export const deserializeGameState = (json: string): GameState => {
  const o = obj(JSON.parse(json), 'save')

  // An older or newer save is a migration problem, not a parse problem — say so rather than
  // failing on whichever field happens to have changed shape.
  const version = num(o.version, 'save.version')
  if (version !== FORMAT_VERSION) {
    fail(`save format version ${version}, expected ${FORMAT_VERSION}`)
  }

  const windlassProgress = new Map<number, number>()
  for (const raw of arr(o.windlassProgress, 'windlassProgress')) {
    const [k, val] = entry(raw, 'windlassProgress')
    windlassProgress.set(num(k, 'windlass room id'), num(val, 'windlass banked count'))
  }

  return {
    maze: decodeMaze(o.maze),
    currentRoomId: num(o.currentRoomId, 'currentRoomId'),
    visitedRoomIds: new Set(
      arr(o.visitedRoomIds, 'visitedRoomIds').map((x) => num(x, 'visited room id')),
    ),
    inventory: decodeInventory(o.inventory),
    coinsCollected: num(o.coinsCollected, 'coinsCollected'),
    treasureBonus: num(o.treasureBonus, 'treasureBonus'),
    windlassProgress,
    correctAnswers: num(o.correctAnswers, 'correctAnswers'),
    elapsedMillis: num(o.elapsedMillis, 'elapsedMillis'),
    settings: decodeSettings(o.settings),
    isComplete: bool(o.isComplete, 'isComplete'),
  }
}
