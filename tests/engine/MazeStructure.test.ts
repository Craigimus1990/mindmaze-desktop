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
