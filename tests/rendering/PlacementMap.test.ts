import { describe, it, expect } from 'vitest'
import { PlacementMap } from '@/rendering/PlacementMap'
import { CharacterCatalog } from '@/rendering/CharacterCatalog'
import { hasAsset, ASSET_NAMES } from '@/rendering/assetManifest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The hand-authored placement map that replaced computed positioning.
 *
 * Placement used to be derived: a free compass wall projected through the current view and
 * mirrored to face the room's centre. That knew where doors were but nothing about where a given
 * room's furniture, rug or fireplace actually sat, so characters stood in front of tables and in
 * doorway approaches. These entries come from tools/placement_editor.py and are checked here
 * against the same rules the editor enforces.
 */

const json = readFileSync(
  join(__dirname, '../../src/assets/data/character_placements.json'),
  'utf-8',
)
const map = PlacementMap.parse(json)

const configs = [
  'room_deadend', 'room_with_center', 'room_with_center_right', 'room_with_left',
  'room_with_left_center', 'room_with_left_center_right', 'room_with_left_right',
  'room_with_right',
]

const themes = [
  'stone_corridor', 'great_library', 'alchemy_study', 'map_room', 'armory',
  'astronomer_tower', 'great_hall', 'cellar_vault', 'chapel', 'music_room',
  'garden_courtyard',
]

describe('PlacementMap', () => {
  it('the shipped map is not empty', () => {
    expect(Object.keys(map).length, 'no placements parsed; every room would be unpopulated').toBeGreaterThan(0)
  })

  it('every placement names a character that exists', () => {
    const known = new Set(CharacterCatalog.ALL.map((c) => c.id))
    for (const [room, entries] of Object.entries(map)) {
      for (const p of entries) {
        expect(known.has(p.character), `${room} references unknown character '${p.character}'`).toBe(true)
      }
    }
  })

  it('every placement names a room backdrop that ships', () => {
    for (const room of Object.keys(map)) {
      expect(hasAsset(room), `placement map references missing backdrop ${room}`).toBe(true)
    }
  })

  it('placement coordinates stay on screen', () => {
    for (const [room, entries] of Object.entries(map)) {
      for (const p of entries) {
        expect(p.x, `${room}/${p.character}: x=${p.x} is off the pane`).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(1)
        expect(p.feetY, `${room}/${p.character}: feetY=${p.feetY}`).toBeGreaterThanOrEqual(0)
        expect(p.feetY).toBeLessThanOrEqual(1.05)
        expect(p.height, `${room}/${p.character}: height=${p.height} is implausible`).toBeGreaterThanOrEqual(0.05)
        expect(p.height).toBeLessThanOrEqual(1)
      }
    }
  })

  it('a room with placements resolves one deterministically', () => {
    // Entries for a room are alternatives, not a group scene: exactly one is shown, picked
    // by room id so it survives save/reload and cannot change under the player.
    const roomKey = Object.entries(map).find(([, v]) => v.length > 1)?.[0]
    expect(roomKey).toBeDefined()
    for (let id = 0; id < 50; id++) {
      const a = PlacementMap.forRoom(map, roomKey!, id)
      const b = PlacementMap.forRoom(map, roomKey!, id)
      expect(a?.character, `selection changed between calls for id ${id}`).toBe(b?.character)
    }
  })

  it('about half of rooms host a character', () => {
    // Every backdrop has placements authored, so without this gate every room would be
    // occupied — 10.75 characters across a ~10.8-room SIMPLE path. A character has to be a
    // find, not wallpaper.
    let count = 0
    for (let i = 0; i < 10_000; i++) {
      if (PlacementMap.isPopulated(i)) count++
    }
    const rate = count / 10_000
    expect(rate, `density was ${rate}; expected ~0.50`).toBeGreaterThanOrEqual(0.45)
    expect(rate).toBeLessThanOrEqual(0.55)
  })

  it('population is stable for a given room id', () => {
    // Re-derived on every render and after save/reload; an unstable answer would make
    // characters blink in and out as the player walks back and forth.
    for (let id = 0; id < 300; id++) {
      expect(PlacementMap.isPopulated(id)).toBe(PlacementMap.isPopulated(id))
    }
  })

  it('alternatives are all reachable across room ids', () => {
    // A selection that collapsed onto one entry would waste the authoring work.
    const roomEntry = Object.entries(map).find(([, v]) => v.length >= 3)
    expect(roomEntry).toBeDefined()
    const [roomKey, entries] = roomEntry!
    const seen = new Set<string>()
    for (let id = 0; id < 2000; id++) {
      const c = PlacementMap.forRoom(map, roomKey, id)?.character
      if (c) seen.add(c)
    }
    expect(seen.size, `only ${seen.size} of ${entries.length} alternatives are reachable in ${roomKey}`).toBe(
      entries.length,
    )
  })

  it('an unknown room yields no character', () => {
    expect(PlacementMap.forRoom(map, 'room_that_does_not_exist', 1)).toBeNull()
  })

  it('rooms with three exits can host a character', () => {
    // The old rule required two or fewer exits, on the theory that a character needed a
    // "free wall". With hand-authored positions that no longer holds, and the rule was what
    // made characters rare: after the maze navigability fix most rooms have three exits, and
    // a SIMPLE playthrough averaged 0.56 characters.
    const threeExit = Object.keys(map).filter((k) => k.includes('left_center_right'))
    expect(threeExit.length, 'no three-exit rooms in the map').toBeGreaterThan(0)
    const populated = threeExit.filter((room) => {
      for (let i = 0; i < 40; i++) {
        if (PlacementMap.forRoom(map, room, i) !== null) return true
      }
      return false
    })
    expect(
      populated.length,
      'some three-exit rooms can never host a character; the rarity fix did not land',
    ).toBe(threeExit.length)
  })

  it('every theme has art and placements for every door configuration', () => {
    // A room's config changes with the direction the player enters from, so one room renders
    // as room_with_left going in and room_with_center_right coming back. If a theme were
    // missing either the backdrop or the placements for one of those, the room would visibly
    // change decor or lose its inhabitant when the player turned around.
    const gaps: string[] = []
    for (const theme of themes) {
      for (const config of configs) {
        const asset = `${config}_${theme}`
        if (!hasAsset(asset)) gaps.push(`${asset} (no art)`)
        if (!map[asset] || map[asset].length === 0) gaps.push(`${asset} (no placements)`)
      }
    }
    expect(gaps, `incomplete theme coverage: ${gaps.slice(0, 10)}`).toEqual([])
  })

  it('a theme offers the same cast in every door configuration', () => {
    // What actually keeps a character from swapping when the player backtracks: the room's
    // inhabitant is chosen from this cast by room id, so the cast must not depend on which
    // config is being viewed.
    for (const theme of themes) {
      const casts = new Map<string, string[]>()
      for (const config of configs) {
        const entries = map[`${config}_${theme}`] ?? []
        casts.set(config, [...new Set(entries.map((e) => e.character))].sort())
      }
      const reference = casts.get(configs[0]!)!
      for (const [config, cast] of casts) {
        expect(
          cast,
          `${theme}/${config} offers a different cast; a character would change when the player re-enters the room facing another way`,
        ).toEqual(reference)
      }
    }
  })

  it('a room keeps its character across every door configuration', () => {
    // The end-to-end version of the bug: same room id, same theme, all eight facings.
    for (const theme of themes) {
      for (let roomId = 0; roomId < 60; roomId++) {
        const chosen = new Set(
          configs.map((config) => PlacementMap.forRoom(map, `${config}_${theme}`, roomId)?.character),
        )
        expect(
          chosen.size,
          `room ${roomId} in ${theme} shows ${chosen.size} different characters depending on facing: ${[...chosen]}`,
        ).toBe(1)
      }
    }
  })

  it('placements clear the doorways of their own configuration', () => {
    // Seeded placements were copied between configs, so a character could land in a doorway
    // that the source config did not have.
    const doorX: Record<string, number> = { left: 0.16, center: 0.50, right: 0.84 }
    for (const [asset, entries] of Object.entries(map)) {
      const config = configs.find((c) => asset === c || asset.startsWith(`${c}_`))
      if (!config) continue
      const slots = config.replace(/^room_with_/, '').split('_')
      const doors = Object.entries(doorX).filter(([name]) => slots.includes(name))
      for (const p of entries) {
        for (const [name, x] of doors) {
          expect(
            Math.abs(p.x - x) > 0.07,
            `${asset}/${p.character} at x=${p.x} stands in the ${name} doorway (x=${x})`,
          ).toBe(true)
        }
      }
    }
  })

  // --- JSON policy: malformed input degrades to an empty map, it never throws. Characters are
  // decoration and the game is entirely playable without them — see PlacementMap.parse. ---

  it('does not throw on malformed JSON and returns an empty map', () => {
    expect(() => PlacementMap.parse('not json at all')).not.toThrow()
    expect(PlacementMap.parse('not json at all')).toEqual({})
  })

  it('does not throw on valid JSON with the wrong shape', () => {
    expect(PlacementMap.parse('{}')).toEqual({})
    expect(PlacementMap.parse('[]')).toEqual({})
    expect(PlacementMap.parse('null')).toEqual({})
    expect(PlacementMap.parse('{"placements": "not an object"}')).toEqual({})
    expect(PlacementMap.parse('{"placements": {"room": "not a list"}}')).toEqual({})
  })

  it('drops rooms whose entry list is empty after filtering', () => {
    const parsed = PlacementMap.parse('{"placements": {"room_x": []}}')
    expect(parsed.room_x).toBeUndefined()
  })

  it('drops individual malformed entries but keeps the well-formed ones in the same room', () => {
    const parsed = PlacementMap.parse(
      JSON.stringify({
        placements: {
          room_x: [
            { character: 'mouse_alchemist', x: 0.3, feetY: 0.8, height: 0.4 },
            { character: 'bad_entry_missing_fields' },
          ],
        },
      }),
    )
    expect(parsed.room_x?.length).toBe(1)
    expect(parsed.room_x?.[0]?.character).toBe('mouse_alchemist')
  })

  it('most shipped backdrops have a character authored', () => {
    const backdrops = ASSET_NAMES.filter((n) => n.startsWith('room_'))
    const covered = backdrops.filter((b) => (map[b]?.length ?? 0) > 0).length
    expect(
      covered,
      `only ${covered} of ${backdrops.length} backdrops have placements`,
    ).toBeGreaterThanOrEqual(backdrops.length * 0.8)
  })
})
