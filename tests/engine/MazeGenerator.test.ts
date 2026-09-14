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
