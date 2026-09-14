import { GRID_SIZE, directionOffset, opposite } from '../model/Direction'
import type { Direction } from '../model/Direction'
import { door, gate, makeRoom, PICKUP_COIN, PICKUP_HINT, PICKUP_KEY } from '../model/Room'
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
