import { describe, it, expect } from 'vitest'
import { generate } from '@/engine/engine/MazeGenerator'
import { makeRng } from '@/engine/engine/rng'
import { directionOffset } from '@/engine/model/Direction'
import type { Maze } from '@/engine/model/Maze'
import { isRaised } from '@/engine/model/Maze'
import type { Complexity } from '@/engine/model/types'

/**
 * The barrier on the treasure room.
 *
 * The invariant that matters most here is winnability: a key hidden behind the very door it
 * opens, or a windlass room walled off behind the treasure, makes the maze impossible — and would
 * show up rarely enough to be miserable to reproduce from a bug report.
 */

/**
 * Rooms reachable from the start WITHOUT entering the treasure room.
 *
 * Ignores locked doors and closed gates elsewhere in the maze, since those have their own
 * keys and buttons; the question here is only whether the treasure's prerequisites can be
 * got at before the treasure itself.
 */
const reachableAvoidingTreasure = (maze: Maze): Set<number> => {
  const seen = new Set([maze.startId])
  const queue = [maze.startId]
  while (queue.length > 0) {
    const cur = queue.shift()!
    const room = maze.rooms.get(cur)
    if (!room) continue
    for (const [dir, exit] of room.exits) {
      if (exit.type === 'Absent') continue
      const next = cur + directionOffset(dir)
      if (next === maze.treasureId) continue
      if (maze.rooms.get(next) !== undefined && !seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

const mazes = (c: Complexity, n = 60): Maze[] =>
  Array.from({ length: n }, (_, i) => generate(c, makeRng(i)))

describe('treasure lock', () => {
  it('simple mazes leave the treasure unblocked', () => {
    // The easiest tier is for the youngest players; a fetch quest before the payoff is the
    // opposite of what it needs.
    for (const maze of mazes('SIMPLE')) {
      expect(maze.treasureLock.type, 'SIMPLE should not block the treasure').toBe('Open')
    }
  })

  it('medium mazes lock the treasure behind a key', () => {
    for (const maze of mazes('MEDIUM')) {
      expect(maze.treasureLock.type, 'MEDIUM should need a key').toBe('Locked')
    }
  })

  it('hard mazes bar the treasure behind two windlasses', () => {
    for (const maze of mazes('HARD')) {
      const lock = maze.treasureLock
      expect(lock.type, 'HARD should need windlasses').toBe('Barred')
      if (lock.type !== 'Barred') continue
      expect(lock.windlassRoomIds.size).toBe(2)
    }
  })

  it('every door into the treasure room carries the barrier', () => {
    // A single unguarded approach would let the player wander in and skip the whole puzzle.
    for (const maze of [...mazes('MEDIUM'), ...mazes('HARD')]) {
      const treasure = maze.rooms.get(maze.treasureId)!
      const guarded = [...treasure.exits].filter(([, e]) => e.type !== 'Absent')
      expect(guarded.length > 0, 'treasure room has no doors at all').toBe(true)
      for (const [dir, exit] of guarded) {
        const blocked =
          exit.type === 'Door'
            ? exit.state === 'LOCKED'
            : exit.type === 'Gate'
              ? !exit.open
              : false
        expect(
          blocked,
          `treasure door ${dir} is ${JSON.stringify(exit)}; it should be locked or barred`,
        ).toBe(true)
      }
    }
  })

  it('the key is reachable without entering the treasure room', () => {
    // The failure this exists to prevent: a key placed behind the door it opens.
    for (const maze of mazes('MEDIUM')) {
      const lock = maze.treasureLock
      expect(lock.type).toBe('Locked')
      if (lock.type !== 'Locked') continue
      expect(
        reachableAvoidingTreasure(maze).has(lock.keyRoomId),
        `key room ${lock.keyRoomId} cannot be reached without crossing the treasure door`,
      ).toBe(true)
      expect(
        maze.rooms.get(lock.keyRoomId)?.pickup.type,
        `room ${lock.keyRoomId} was nominated as the key room but holds no key`,
      ).toBe('Key')
    }
  })

  it('both windlass rooms are reachable without entering the treasure room', () => {
    for (const maze of mazes('HARD')) {
      const lock = maze.treasureLock
      expect(lock.type).toBe('Barred')
      if (lock.type !== 'Barred') continue
      const reachable = reachableAvoidingTreasure(maze)
      for (const id of lock.windlassRoomIds) {
        expect(reachable.has(id), `windlass room ${id} is walled off behind the treasure`).toBe(
          true,
        )
      }
    }
  })

  it('windlass rooms are dead ends and distinct', () => {
    // Max asked for dead ends specifically: a windlass at a junction is easy to walk past
    // without noticing, and the room needs to feel like a destination.
    for (const maze of mazes('HARD')) {
      const lock = maze.treasureLock
      expect(lock.type).toBe('Barred')
      if (lock.type !== 'Barred') continue
      expect(lock.windlassRoomIds.size, 'the two windlasses must be separate rooms').toBe(2)
      for (const id of lock.windlassRoomIds) {
        const exitCount = [...maze.rooms.get(id)!.exits.values()].filter(
          (e) => e.type !== 'Absent',
        ).length
        expect(
          exitCount <= 1,
          `windlass room ${id} has ${exitCount} exits; it is not a dead end`,
        ).toBe(true)
        expect(id !== maze.treasureId && id !== maze.startId).toBe(true)
      }
    }
  })

  it('a barred lock only opens once both windlasses are done', () => {
    const windlassRoomIds = new Set([4, 9])
    expect(
      isRaised({ type: 'Barred', windlassRoomIds, completed: new Set() }),
      'a fresh gate is down',
    ).toBe(false)
    expect(
      isRaised({ type: 'Barred', windlassRoomIds, completed: new Set([4]) }),
      'one windlass is not enough',
    ).toBe(false)
    expect(
      isRaised({ type: 'Barred', windlassRoomIds, completed: new Set([4, 9]) }),
      'both windlasses raise the gate',
    ).toBe(true)
  })
})
