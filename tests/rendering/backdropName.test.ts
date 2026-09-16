import { describe, it, expect } from 'vitest'
import { assetName, themeFor, themedAssetName } from '@/rendering/backdropName'
import { hasAsset } from '@/rendering/assetManifest'
import { forEntry } from '@/util/ExitLayout'
import { door, gate, type ExitType } from '@/engine/model/Room'
import type { Direction } from '@/engine/model/Direction'

describe('assetName', () => {
  it('no exits maps to deadend', () => {
    const exits = new Map<Direction, ExitType>()
    expect(assetName(exits)).toBe('room_deadend')
  })

  it('left exit only maps to room_with_left', () => {
    const layout = forEntry('EAST')
    const exits = new Map<Direction, ExitType>([[layout.left, door('OPEN')]])
    expect(assetName(exits, layout)).toBe('room_with_left')
  })

  it('center and right exits maps to room_with_center_right', () => {
    const layout = forEntry('EAST')
    const exits = new Map<Direction, ExitType>([
      [layout.center, door('CLOSED')],
      [layout.right, gate('A', true)],
    ])
    expect(assetName(exits, layout)).toBe('room_with_center_right')
  })

  it('all three exits maps to room_with_left_center_right', () => {
    const layout = forEntry('EAST')
    const exits = new Map<Direction, ExitType>([
      [layout.left, door('OPEN')],
      [layout.center, door('CLOSED')],
      [layout.right, door('LOCKED')],
    ])
    expect(assetName(exits, layout)).toBe('room_with_left_center_right')
  })
})

describe('themeFor / themedAssetName', () => {
  it('is stable for a room id across different exit configurations', () => {
    // The bug this guards against: the door CONFIG changes as the player turns around (the
    // same room reads as room_with_left from one side, room_with_center_right from the
    // other). Keying the theme on config instead of room id made a room change decor — and
    // its inhabitant — purely because the player backtracked. Theme must depend only on
    // roomId, never on which base name was passed in.
    for (const roomId of [0, 1, 7, 42, 99]) {
      const theme = themeFor(roomId)
      const configs = [
        'room_deadend', 'room_with_left', 'room_with_center', 'room_with_right',
        'room_with_left_center', 'room_with_left_right', 'room_with_center_right',
        'room_with_left_center_right',
      ]
      for (const base of configs) {
        expect(themedAssetName(base, roomId)).toBe(theme === null ? base : `${base}_${theme}`)
      }
    }
  })

  it('composed names resolve to shipped assets', () => {
    const configs = [
      'room_deadend', 'room_with_left', 'room_with_center', 'room_with_right',
      'room_with_left_center', 'room_with_left_right', 'room_with_center_right',
      'room_with_left_center_right',
    ]
    for (let roomId = 0; roomId < 11; roomId++) {
      for (const base of configs) {
        const name = themedAssetName(base, roomId)
        expect(hasAsset(name), `missing themed asset ${name}`).toBe(true)
      }
    }
  })
})
