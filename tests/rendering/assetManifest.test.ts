import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const drawableDir = join(__dirname, '../../src/assets/drawable')

describe('drawable assets', () => {
  it('all 133 drawables are present', () => {
    expect(readdirSync(drawableDir).length).toBe(133)
  })

  it('every drawable is a web-servable format', () => {
    for (const f of readdirSync(drawableDir)) {
      expect(f, `${f} is not a web format`).toMatch(/\.(webp|png)$/)
    }
  })

  it('character sprites follow the char_ naming convention', () => {
    const chars = readdirSync(drawableDir).filter((f) => f.startsWith('char_'))
    expect(chars.length).toBeGreaterThan(0)
  })
})
