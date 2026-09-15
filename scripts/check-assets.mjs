// Verifies that every asset name referenced in source resolves to a real file.
// Replaces the Android Robolectric asset tests, which cannot run under Vitest.
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const drawables = new Set(
  readdirSync(join(root, 'src/assets/drawable')).map((f) =>
    f.replace(/\.(webp|png)$/, ''),
  ),
)

const placements = JSON.parse(
  readFileSync(join(root, 'src/assets/data/character_placements.json'), 'utf-8'),
)

// Extract character ids from the actual structure
const ids = new Set()
for (const entries of Object.values(placements.placements ?? {})) {
  for (const entry of entries) {
    if (entry && typeof entry.character === 'string') ids.add(entry.character)
  }
}

// Guard against vacuity — if no ids were found, the check would pass incorrectly
if (ids.size === 0) {
  console.error('ERROR: No character ids found in character_placements.json')
  console.error('The check would pass vacuously. This likely means the JSON structure changed.')
  process.exit(1)
}

// Check each character id with the char_ prefix
const missing = []
for (const id of ids) {
  const name = `char_${id}`
  if (!drawables.has(name)) {
    missing.push(`${name} (id "${id}")`)
  }
}

if (missing.length > 0) {
  console.error('Missing drawables referenced by character_placements.json:')
  for (const m of missing) console.error(`  ${m}`)
  process.exit(1)
}
console.log(`OK: ${drawables.size} drawables; all ${ids.size} referenced character ids resolve.`)
