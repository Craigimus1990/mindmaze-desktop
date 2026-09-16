/**
 * Name-to-URL map for every drawable, keyed the way Android's R.drawable was.
 *
 * CharacterCatalog and the renderers refer to assets by bare name ("char_abbotess",
 * "great_library__room_with_left"), so the lookup keeps those names working unchanged.
 */
const modules = import.meta.glob<string>('../assets/drawable/*.{webp,png}', {
  eager: true,
  import: 'default',
  query: '?url',
})

const byName = new Map<string, string>()
for (const [path, url] of Object.entries(modules)) {
  const name = path.split('/').pop()!.replace(/\.(webp|png)$/, '')
  byName.set(name, url as string)
}

export const assetUrl = (name: string): string | undefined => byName.get(name)
export const hasAsset = (name: string): boolean => byName.has(name)
export const ASSET_NAMES: readonly string[] = [...byName.keys()].sort()

export const MUSIC_URL = new URL('../assets/audio/music_market_day.mp3', import.meta.url).href
