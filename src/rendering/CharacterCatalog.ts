/**
 * One inhabitant of the castle.
 *
 * `themes` are the room themes (see docs/art/themes.json) this character suits. An empty set
 * marks a generic character, eligible anywhere — the fallback that keeps a room from being left
 * empty just because its theme has no specific match.
 */
export class Character {
  readonly id: string
  readonly asset: string
  readonly themes: ReadonlySet<string>

  constructor(id: string, asset: string, themes: ReadonlySet<string> = new Set()) {
    this.id = id
    this.asset = asset
    this.themes = themes
  }

  get isGeneric(): boolean {
    return this.themes.size === 0
  }
}

/**
 * The cast.
 *
 * Redwall-flavoured: heroic mice in chainmail, squirrel maids, otter cooks, a hare messenger from
 * the badger lord. All sprites are generated on a flat white background and cut out at generation
 * time on a flat white background rather than chroma green (the sprites have fine translucent
 * edges — whiskers, ear interiors — that green would fringe). That rationale lives in the Android
 * repo's own design notes, which are not part of this port.
 *
 * Which character appears in which room is not decided here: it is authored per backdrop in
 * character_placements.json and resolved by PlacementMap.
 */
export const CharacterCatalog = {
  // Selection used to live here — forRoom(roomId, theme) picked a character by hashing the
  // room id against the theme's candidates. That moved into tools/placement_editor.py, which
  // uses Character.themes to offer candidates per room; the chosen character is then named
  // outright in character_placements.json. The themes field is still load-bearing for the
  // editor, so it stays.

  /**
   * The characters that currently ship.
   *
   * Deliberately only the sprites that exist as drawables — CharacterCatalogTest asserts every
   * entry has its asset, so this list and the drawable assets cannot drift apart.
   */
  ALL: [
    new Character(
      'mouse_warrior',
      'char_mouse_warrior',
      new Set(['armory', 'great_hall', 'chapel', 'stone_corridor']),
    ),
    new Character(
      'otter_cook',
      'char_otter_cook',
      new Set(['great_hall', 'cellar_vault']),
    ),
    new Character(
      'hare_colonel',
      'char_hare_colonel',
      new Set(['armory', 'great_hall', 'map_room']),
    ),
    new Character(
      'vole_napping',
      'char_vole_napping',
      new Set(['great_library', 'music_room']),
    ),
    new Character(
      'squirrel_forager',
      'char_squirrel_forager',
      new Set(['garden_courtyard', 'cellar_vault']),
    ),
    new Character(
      'abbotess',
      'char_abbotess',
      new Set(['chapel', 'garden_courtyard']),
    ),
    new Character(
      'porcupine_feasting',
      'char_porcupine_feasting',
      new Set(['great_hall', 'cellar_vault']),
    ),
    new Character(
      'otter_carpenter',
      'char_otter_carpenter',
      new Set(['armory', 'cellar_vault', 'stone_corridor']),
    ),
    new Character(
      'shrew_musician',
      'char_shrew_musician',
      new Set(['music_room', 'great_hall']),
    ),
    new Character(
      'squirrel_singer',
      'char_squirrel_singer',
      new Set(['music_room', 'chapel']),
    ),
    new Character(
      'mouse_alchemist',
      'char_mouse_alchemist',
      new Set(['alchemy_study', 'astronomer_tower']),
    ),
    new Character(
      'mouse_reader',
      'char_mouse_reader',
      new Set(['great_library']),
    ),
    new Character(
      'vole_gardener',
      'char_vole_gardener',
      new Set(['garden_courtyard']),
    ),
    new Character(
      'shrew_stargazer',
      'char_shrew_stargazer',
      new Set(['astronomer_tower', 'map_room']),
    ),
    new Character(
      'porcupine_scribe',
      'char_porcupine_scribe',
      new Set(['map_room', 'great_library']),
    ),
    new Character(
      'hare_sentry',
      'char_hare_sentry',
      new Set(['stone_corridor', 'armory']),
    ),
    new Character(
      'mice_children',
      'char_mice_children',
      new Set(['garden_courtyard', 'great_hall']),
    ),
    // Generic: no themes, so these are the fallback anywhere without a specific match.
    new Character('squirrel_maid', 'char_squirrel_maid'),
    new Character('elder_mouse', 'char_elder_mouse'),
    new Character('friends_chatting', 'char_friends_chatting'),
  ] as readonly Character[],
}
