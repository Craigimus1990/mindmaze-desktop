import { describe, it, expect } from 'vitest'
import { opposite, directionOffset, DIRECTIONS } from '@/engine/model/Direction'
import { isRaised } from '@/engine/model/Maze'
import type { TreasureLock } from '@/engine/model/Maze'

describe('Direction', () => {
  it('opposite flips each direction', () => {
    expect(opposite('NORTH')).toBe('SOUTH')
    expect(opposite('SOUTH')).toBe('NORTH')
    expect(opposite('EAST')).toBe('WEST')
    expect(opposite('WEST')).toBe('EAST')
  })

  it('directionOffset matches the 10-wide grid', () => {
    expect(directionOffset('NORTH')).toBe(-10)
    expect(directionOffset('SOUTH')).toBe(10)
    expect(directionOffset('EAST')).toBe(1)
    expect(directionOffset('WEST')).toBe(-1)
  })

  it('DIRECTIONS lists all four', () => {
    expect(DIRECTIONS).toEqual(['NORTH', 'SOUTH', 'EAST', 'WEST'])
  })
})

describe('TreasureLock.Barred', () => {
  it('is raised only when every windlass is completed', () => {
    const partial: TreasureLock = {
      type: 'Barred',
      windlassRoomIds: new Set([3, 7]),
      completed: new Set([3]),
    }
    const done: TreasureLock = {
      type: 'Barred',
      windlassRoomIds: new Set([3, 7]),
      completed: new Set([3, 7]),
    }
    expect(isRaised(partial)).toBe(false)
    expect(isRaised(done)).toBe(true)
  })
})
