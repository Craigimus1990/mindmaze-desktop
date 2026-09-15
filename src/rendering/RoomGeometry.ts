/**
 * The single source of truth for where doors live in a room backdrop.
 *
 * Before this existed the same geometry was hardcoded in three places that had drifted apart:
 * RoomRenderer.drawExitOverlays drew labels at x-fractions 0.18/0.50/0.82, `GameScreen.handleTap`
 * hit-tested at thirds, and the shipped art actually put its doors at 0.156/0.500/0.844 with
 * centers near 0.60h while the labels drew at 0.50h/0.40h. Labels floated above and inboard of the
 * doors they described, and nothing failed a test because nothing tested it.
 *
 * ## The authored spec
 *
 * Assets are authored against {@link SPEC_ASPECT} with doors centered at {@link DOOR_X} and
 * {@link DOOR_CENTER_Y}, in fractions of the *source image*. Round numbers, deliberately: art and
 * code both target these, so neither side owns them and both can be checked against them.
 *
 * ## Why source fractions are not screen fractions
 *
 * RoomRenderer draws the backdrop center-cropped ("cover"): scaled uniformly until it fills the
 * pane, with the overflow cropped evenly off both sides (or top and bottom). Uniform scaling is
 * what keeps a door's *shape* intact — the previous fill-the-rect stretch squashed every asset by
 * a different factor, harmlessly at 0.93x for the 1.667 placeholders but 0.53x for a 2.9:1 image,
 * which would render a door nearly twice as tall-and-thin as it was drawn.
 *
 * The cost is that cropping moves things: a door authored at source fraction 0.16 appears at screen
 * fraction 0.136 on a 1.667 asset, because the crop ate the outer edges it was measured against.
 * {@link projectX}/{@link projectY} apply that mapping, so callers work in screen space without
 * re-deriving it.
 *
 * ## Aspect tolerance
 *
 * Cropping only moves doors when it trims the *width*. An asset wider than the pane loses its outer
 * edges, and side doors march toward the screen edge: a 0.16 door sits at 0.136 on a 1.667 asset,
 * 0.096 on 1.85, and reaches the edge outright at 2.288. {@link MAX_ASPECT} stays well inside that.
 *
 * An asset *narrower* than the pane — the normal case now that {@link SPEC_ASPECT} is tablet-tuned —
 * is trimmed top and bottom instead, so door x-fractions pass through untouched and only ceiling
 * and floor are lost. That is the cheaper direction to err in, which is why {@link MIN_ASPECT} is
 * permissive: art can be too tall without ever misplacing a door.
 */

/**
 * Aspect ratio backdrops should be authored at.
 *
 * Tuned for tablets, which are the target: the room pane is 70% of the screen width minus the
 * minimap, by the full height minus the system bars, so its aspect is a property of the
 * *device*, not the app. Measured/derived panes span a wide range — Pixel Tablet 1.174,
 * Galaxy Tab A9+ 1.194, generic 16:9 tablet 1.360, and (measured on device) Pixel 7a 1.755.
 *
 * 1.25 is the value that minimizes worst-case cropping across the tablets: 6% / 4% / 8%
 * respectively. It costs the phone — a 1.755 pane crops ~29% off a 1.25 asset — but the phone
 * is the development device, not the thing kids will hold. Authoring to the phone instead
 * would invert that and throw away a third of every tablet image.
 */
export const SPEC_ASPECT = 1.25

/**
 * Beyond this, center-cropping pushes side doors too close to the screen edge to use.
 *
 * Derived against {@link SPEC_ASPECT} as the reference pane, not picked by feel: a 0.16 door lands
 * exactly on the screen edge at source aspect 1.838, so the ceiling sits at the aspect that
 * still leaves a 5% margin. The previous 1.85 was computed against the old 1.556 spec and
 * became wrong the moment the spec moved — an asset at 1.85 would have had its side doors
 * cropped clean off a 1.25 pane.
 */
export const MAX_ASPECT = 1.65

/**
 * Below this the image is so tall the crop discards most of its height. Set beneath the
 * narrowest real tablet pane (1.174) so tablet-shaped art is never rejected as unsupported.
 */
export const MIN_ASPECT = 1.10

/** Door center x, as a fraction of source width, for the left/center/right slots. */
export const DOOR_LEFT_X = 0.16
export const DOOR_CENTER_X = 0.50
export const DOOR_RIGHT_X = 0.84

/** Door center y, as a fraction of source height. Doors sit below the horizon, not on it. */
export const DOOR_CENTER_Y = 0.60

export const DOOR_X: readonly number[] = [DOOR_LEFT_X, DOOR_CENTER_X, DOOR_RIGHT_X]

/**
 * Door box size as a fraction of the source image. The center door is larger than the side
 * doors because it sits on the far wall while the sides are on walls angling away from the
 * camera — the existing art already used this convention (0.18x0.57 sides, 0.19x0.68 center)
 * and it is what makes the room read as a perspective view rather than a flat wall.
 *
 * These are what asset authors draw to; only the centers matter to the renderer, but a door
 * drawn at the wrong size will not sit under its overlay even with a correct center.
 */
export const SIDE_DOOR_WIDTH = 0.18
export const SIDE_DOOR_HEIGHT = 0.57
export const CENTER_DOOR_WIDTH = 0.19
export const CENTER_DOOR_HEIGHT = 0.68

/**
 * Fraction of the source image visible horizontally after center-cropping to `paneAspect`.
 * 1.0 when the source is narrower than the pane, since then the crop takes from the height.
 */
export const visibleWidthFraction = (sourceAspect: number, paneAspect: number): number =>
  sourceAspect > paneAspect ? paneAspect / sourceAspect : 1

/** As {@link visibleWidthFraction}, for the vertical axis. */
export const visibleHeightFraction = (sourceAspect: number, paneAspect: number): number =>
  sourceAspect < paneAspect ? sourceAspect / paneAspect : 1

/**
 * Maps a source-image x-fraction to the screen x-fraction it lands on after center-cropping.
 * Values outside 0..1 mean the point was cropped away entirely.
 */
export const projectX = (sourceX: number, sourceAspect: number, paneAspect: number): number => {
  const visible = visibleWidthFraction(sourceAspect, paneAspect)
  return (sourceX - 0.5) / visible + 0.5
}

/** As {@link projectX}, for the vertical axis. */
export const projectY = (sourceY: number, sourceAspect: number, paneAspect: number): number => {
  const visible = visibleHeightFraction(sourceAspect, paneAspect)
  return (sourceY - 0.5) / visible + 0.5
}

/** Screen x-fractions of the three door slots for an asset of `sourceAspect`. */
export const doorScreenX = (sourceAspect: number, paneAspect: number): readonly number[] =>
  DOOR_X.map((x) => projectX(x, sourceAspect, paneAspect))

/**
 * Tap boundaries between the three slots: the midpoints between adjacent door centres, so each
 * door owns the region nearest it. Derived rather than hardcoded — the old code used a
 * thirds-split (0.34/0.67) justified in a comment as the bisectors of door positions it no
 * longer matched.
 */
export const tapBoundaries = (
  sourceAspect: number,
  paneAspect: number,
): [number, number] => {
  const x = doorScreenX(sourceAspect, paneAspect)
  return [(x[0]! + x[1]!) / 2, (x[1]! + x[2]!) / 2]
}

export const isAspectSupported = (sourceAspect: number): boolean =>
  sourceAspect >= MIN_ASPECT && sourceAspect <= MAX_ASPECT
