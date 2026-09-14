import { describe, it, expect } from 'vitest'

describe('toolchain', () => {
  it('runs TypeScript under Vitest', () => {
    const doubled: number[] = [1, 2, 3].map((n) => n * 2)
    expect(doubled).toEqual([2, 4, 6])
  })
})
