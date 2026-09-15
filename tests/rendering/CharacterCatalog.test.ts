import { describe, it, expect } from 'vitest'
import { CharacterCatalog } from '@/rendering/CharacterCatalog'
import { hasAsset } from '@/rendering/assetManifest'

const themes = [
  'stone_corridor', 'great_library', 'alchemy_study', 'map_room', 'armory',
  'astronomer_tower', 'great_hall', 'cellar_vault', 'chapel', 'music_room',
  'garden_courtyard',
]

describe('CharacterCatalog', () => {
  it('every theme has at least one character written for it', () => {
    // Distinct from "every theme can cast somebody", which the generic fallback satisfies on
    // its own. This asserts the themed cast actually covers the room types, so a library is
    // not populated exclusively by characters who belong nowhere in particular.
    const uncovered = themes.filter(
      (theme) => !CharacterCatalog.ALL.some((c) => c.themes.has(theme)),
    )
    expect(uncovered, `themes with no themed character: ${uncovered}`).toEqual([])
  })

  it('every character has a distinct id', () => {
    const ids = CharacterCatalog.ALL.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every character asset ships as a drawable', () => {
    // Same guard as the Kotlin BackdropAssetTest: the renderer resolves these by name, so a
    // typo or a missing file degrades silently to no character rather than failing loudly.
    for (const c of CharacterCatalog.ALL) {
      expect(hasAsset(c.asset), `missing drawable ${c.asset} for character ${c.id}`).toBe(true)
    }
  })

  it('the cast is not empty', () => {
    expect(CharacterCatalog.ALL.length).toBeGreaterThan(0)
  })

  it('isGeneric is true only for characters with no themes', () => {
    for (const c of CharacterCatalog.ALL) {
      expect(c.isGeneric).toBe(c.themes.size === 0)
    }
    expect(CharacterCatalog.ALL.some((c) => c.isGeneric)).toBe(true)
  })

  it('maps a character id to its char_-prefixed asset', () => {
    const alchemist = CharacterCatalog.ALL.find((c) => c.id === 'mouse_alchemist')
    expect(alchemist?.asset).toBe('char_mouse_alchemist')
  })
})
