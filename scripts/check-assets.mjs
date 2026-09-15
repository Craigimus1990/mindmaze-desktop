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

// Validate structure: placements.placements must exist and be an object
if (!placements.placements || typeof placements.placements !== 'object') {
  console.error('ERROR: placements.placements must be a non-null object')
  process.exit(1)
}

const ids = new Set()
let backdropCount = 0
let entryCount = 0
const missing = []

for (const [backdropKey, entries] of Object.entries(placements.placements)) {
  backdropCount++

  // Validate each backdrop value is an array
  if (!Array.isArray(entries)) {
    console.error(`ERROR: backdrop "${backdropKey}" must be an array, got ${typeof entries}`)
    process.exit(1)
  }

  // Validate each entry
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    entryCount++

    // Entry must be a non-null object with a string character field
    if (!entry || typeof entry !== 'object') {
      const type = entry === null ? 'null' : typeof entry
      console.error(`ERROR: backdrop "${backdropKey}" entry ${i} must be a non-null object, got ${type}`)
      process.exit(1)
    }

    if (typeof entry.character !== 'string') {
      console.error(`ERROR: backdrop "${backdropKey}" entry ${i} must have a string "character" field, got ${typeof entry.character}`)
      process.exit(1)
    }

    ids.add(entry.character)
  }
}

// Guard against vacuity — if no ids were found, the check would pass incorrectly
if (ids.size === 0) {
  console.error('ERROR: No character ids found in character_placements.json')
  console.error('The check would pass vacuously. This likely means the JSON structure changed.')
  process.exit(1)
}

// Check each character id with the char_ prefix
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

console.log(`OK: ${drawables.size} drawables; ${backdropCount} backdrops, ${entryCount} entries, all ${ids.size} referenced character ids resolve.`)
