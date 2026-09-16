import { describe, it, expect } from 'vitest'
import {
  SPEC_ASPECT, MIN_ASPECT, MAX_ASPECT,
  DOOR_LEFT_X, DOOR_CENTER_X, DOOR_RIGHT_X, DOOR_CENTER_Y,
  DOOR_X,
  SIDE_DOOR_WIDTH, SIDE_DOOR_HEIGHT, CENTER_DOOR_WIDTH, CENTER_DOOR_HEIGHT,
  visibleWidthFraction, visibleHeightFraction,
  projectX, projectY, doorScreenX, tapBoundaries, isAspectSupported,
} from '@/rendering/RoomGeometry'

describe('RoomGeometry', () => {
  it('holds the authored spec constants', () => {
    expect(SPEC_ASPECT).toBeCloseTo(1.25)
    expect(MIN_ASPECT).toBeCloseTo(1.10)
    expect(MAX_ASPECT).toBeCloseTo(1.65)
    expect(DOOR_LEFT_X).toBeCloseTo(0.16)
    expect(DOOR_CENTER_X).toBeCloseTo(0.50)
    expect(DOOR_RIGHT_X).toBeCloseTo(0.84)
    expect(DOOR_CENTER_Y).toBeCloseTo(0.60)
  })

  it('an asset matching the pane is not cropped', () => {
    expect(visibleWidthFraction(1.25, 1.25)).toBeCloseTo(1)
    expect(visibleHeightFraction(1.25, 1.25)).toBeCloseTo(1)
    expect(projectX(DOOR_LEFT_X, 1.25, 1.25)).toBeCloseTo(DOOR_LEFT_X)
  })

  it('a wider-than-pane asset is cropped horizontally, moving side doors outward', () => {
    // The doc comment's worked example (0.136 at 1.667) was computed against the old 1.556
    // spec aspect it names elsewhere and was never updated when SPEC_ASPECT moved to 1.25 —
    // confirmed against the Kotlin projectX formula itself, which the Kotlin test suite only
    // ever exercises for structural properties (symmetry, ordering, on-screen bounds), never
    // this literal figure. What matters here, and what actually moves: the door lands inward
    // of the door center at the *old* 0.136 reference and outward of its own source position.
    expect(projectX(DOOR_LEFT_X, 1.667, 1.25)).toBeCloseTo(0.0466, 3)
    expect(projectX(DOOR_LEFT_X, 1.667, 1.25)).toBeLessThan(DOOR_LEFT_X)
    expect(visibleHeightFraction(1.667, 1.25)).toBeCloseTo(1)
  })

  it('a narrower-than-pane asset passes x through untouched', () => {
    // Cropping takes from the height instead, so door x-fractions are unaffected.
    expect(projectX(DOOR_LEFT_X, 1.15, 1.25)).toBeCloseTo(DOOR_LEFT_X)
    expect(visibleWidthFraction(1.15, 1.25)).toBeCloseTo(1)
    expect(visibleHeightFraction(1.15, 1.25)).toBeLessThan(1)
  })

  it('the centre door never moves, whatever the crop', () => {
    for (const aspect of [1.1, 1.25, 1.4, 1.65]) {
      expect(projectX(DOOR_CENTER_X, aspect, 1.25)).toBeCloseTo(0.5)
      expect(projectY(0.5, aspect, 1.25)).toBeCloseTo(0.5)
    }
  })

  it('tap boundaries are the midpoints between adjacent door centres', () => {
    const x = doorScreenX(1.25, 1.25)
    const [lo, hi] = tapBoundaries(1.25, 1.25)
    expect(lo).toBeCloseTo((x[0]! + x[1]!) / 2)
    expect(hi).toBeCloseTo((x[1]! + x[2]!) / 2)
  })

  it('accepts aspects in the supported band and rejects the rest', () => {
    expect(isAspectSupported(1.25)).toBe(true)
    expect(isAspectSupported(MIN_ASPECT)).toBe(true)
    expect(isAspectSupported(MAX_ASPECT)).toBe(true)
    expect(isAspectSupported(1.05)).toBe(false)
    expect(isAspectSupported(1.9)).toBe(false)
  })

  // --- Ported from RoomGeometryTest.kt ---

  const pane = SPEC_ASPECT

  it('an asset authored at spec aspect needs no correction', () => {
    DOOR_X.forEach((x) => {
      expect(projectX(x, pane, pane)).toBeCloseTo(x, 3)
    })
    expect(projectY(DOOR_CENTER_Y, pane, pane)).toBeCloseTo(DOOR_CENTER_Y, 3)
  })

  it('center door is unmoved by cropping at any aspect', () => {
    // It sits on the crop axis, so it is the one position that never needs correcting.
    for (const ar of [1.3, 1.45, 1.556, 1.667, 1.85, 2.9]) {
      expect(projectX(0.5, ar, pane)).toBeCloseTo(0.5, 4)
      expect(projectY(0.5, ar, pane)).toBeCloseTo(0.5, 4)
    }
  })

  it('cropping a wide asset pulls side doors toward the edges', () => {
    // An asset wider than the pane loses its outer edges to the crop, so a door measured at
    // 0.16 of the source appears nearer the screen edge than 0.16. At the 1.65 ceiling this
    // is at its most extreme and must still clear the edge with room to spare.
    const x = doorScreenX(MAX_ASPECT, pane)
    expect(x[1]!).toBeCloseTo(0.5, 2)
    expect(x[0]!).toBeLessThan(DOOR_LEFT_X)
    expect(x[2]!).toBeGreaterThan(DOOR_RIGHT_X)
    expect(x[0]!).toBeGreaterThan(0.04)
    expect(x[2]!).toBeLessThan(0.96)
  })

  it('an asset narrower than the pane keeps its door x positions exactly', () => {
    // The common case now that the spec is tablet-tuned: the crop takes height, not width,
    // so door x-fractions pass through untouched and only ceiling and floor are lost.
    for (const ar of [MIN_ASPECT, 1.15, 1.20, pane]) {
      const x = doorScreenX(ar, pane)
      expect(x[0]).toBeCloseTo(DOOR_LEFT_X, 4)
      expect(x[2]).toBeCloseTo(DOOR_RIGHT_X, 4)
    }
  })

  it('projection is symmetric about the center', () => {
    for (const ar of [1.4, 1.667, 1.85]) {
      const x = doorScreenX(ar, pane)
      expect(x[0]).toBeCloseTo(1 - x[2]!, 4)
    }
  })

  it('tap boundaries are the midpoints between door centers', () => {
    const [a, b] = tapBoundaries(1.667, pane)
    const x = doorScreenX(1.667, pane)
    expect(a).toBeCloseTo((x[0]! + x[1]!) / 2, 4)
    expect(b).toBeCloseTo((x[1]! + x[2]!) / 2, 4)
    // Each door must fall inside the region that routes taps to it, or tapping a door
    // visibly opens the wrong exit.
    expect(x[0]!).toBeLessThan(a)
    expect(x[1]!).toBeGreaterThan(a)
    expect(x[1]!).toBeLessThan(b)
    expect(x[2]!).toBeGreaterThan(b)
  })

  it('every door stays on screen across the supported aspect range', () => {
    for (let ar = MIN_ASPECT; ar <= MAX_ASPECT + 0.0001; ar += 0.05) {
      doorScreenX(ar, pane).forEach((x) => {
        expect(x).toBeGreaterThan(0.05)
        expect(x).toBeLessThan(0.95)
      })
    }
  })

  it('aspect support excludes the ratios that crop doors off screen', () => {
    expect(isAspectSupported(SPEC_ASPECT)).toBe(true)
    expect(isAspectSupported(1.477)).toBe(true)
    expect(isAspectSupported(1.174)).toBe(true)
    expect(isAspectSupported(1.500)).toBe(true)
    // The 2.9:1 sample panel: its side doors project outside the pane entirely.
    expect(isAspectSupported(2.945)).toBe(false)
    const offscreen = doorScreenX(2.945, pane)
    expect(offscreen[0]!).toBeLessThan(0)
    expect(offscreen[2]!).toBeGreaterThan(1)
  })

  it('the aspect ceiling keeps side doors clear of the screen edge', () => {
    // MAX_ASPECT is only meaningful relative to the pane it was derived against. Guard the
    // derivation so a future change to SPEC_ASPECT cannot silently leave the ceiling behind:
    // at 1.838 a 0.16 door lands exactly on the edge, so the ceiling must sit below that.
    expect(MAX_ASPECT).toBeLessThan(1.838)
    const x = doorScreenX(MAX_ASPECT, pane)
    expect(x[0]!).toBeGreaterThan(0.04)
    expect(x[2]!).toBeLessThan(0.96)
  })

  it('visible fractions never exceed the whole image', () => {
    for (const ar of [1.2, 1.556, 3.0]) {
      expect(visibleWidthFraction(ar, pane)).toBeLessThanOrEqual(1)
      expect(visibleHeightFraction(ar, pane)).toBeLessThanOrEqual(1)
      // Cover-cropping only ever trims one axis; the other is shown in full.
      const trimmed = [visibleWidthFraction(ar, pane), visibleHeightFraction(ar, pane)].filter(
        (v) => Math.abs(v - 1) > 0.0001,
      ).length
      expect(trimmed).toBeLessThanOrEqual(1)
    }
  })

  it('door box dimensions match the authored art convention', () => {
    expect(SIDE_DOOR_WIDTH).toBeCloseTo(0.18)
    expect(SIDE_DOOR_HEIGHT).toBeCloseTo(0.57)
    expect(CENTER_DOOR_WIDTH).toBeCloseTo(0.19)
    expect(CENTER_DOOR_HEIGHT).toBeCloseTo(0.68)
  })
})
