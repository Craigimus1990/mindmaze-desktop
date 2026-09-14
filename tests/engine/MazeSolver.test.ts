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
