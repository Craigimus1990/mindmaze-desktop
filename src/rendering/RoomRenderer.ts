import type { Direction } from '../engine/model/Direction'
import { TREASURE_GATE_ID } from '../engine/engine/constants'
import type { Room } from '../engine/model/Room'
import type { Inventory } from '../engine/model/types'
import type { TreasureLock } from '../engine/model/Maze'
import { TREASURE_OPEN } from '../engine/model/Maze'
import type { ExitLayout } from '../util/ExitLayout'
import { assetName as computeAssetName, themedAssetName } from './backdropName'
import { roomTreasureFor } from './RoomTreasure'
import { PlacementMap, type PlacementFile } from './PlacementMap'
import { CharacterCatalog } from './CharacterCatalog'
import type { ImageAssetManager } from './ImageAssetManager'
import placementJson from '../assets/data/character_placements.json?raw'
import {
  DOOR_CENTER_Y, doorScreenX, projectX, projectY,
  visibleWidthFraction, visibleHeightFraction,
} from './RoomGeometry'

/** Treasure height as a fraction of the pane — big enough for a child to hit reliably. */
const TREASURE_HEIGHT_FRACTION = 0.13

/** The key is the objective, not scenery, so it is drawn noticeably bigger. */
const KEY_HEIGHT_FRACTION = 0.2

/** The windlass is the subject of its room, so it is drawn far larger than a pickup. */
const WINDLASS_HEIGHT_FRACTION = 0.34
const WINDLASS_X = 0.5
const WINDLASS_FEET_Y = 0.86

/** Parsed once at module load, exactly like the Kotlin singleton's cached `PlacementMap.load`. */
const PLACEMENTS: PlacementFile = PlacementMap.parse(placementJson)

export interface DrawRoomOptions {
  readonly room: Room
  readonly layout: ExitLayout
  readonly inventory: Inventory
  readonly coinsCollected: number
  readonly score: number
  readonly elapsedMillis: number
  readonly width: number
  readonly height: number
  readonly lock?: TreasureLock
  readonly images: ImageAssetManager
}

/**
 * The sub-rectangle of the source image, in fractions of its own width/height, that fills the
 * pane without distortion: the whole image on the axis that fits, centered and trimmed on the
 * axis that overflows.
 */
const coverSrcRect = (
  sourceAspect: number,
  paneAspect: number,
): { sx: number; sy: number; sw: number; sh: number } => {
  const visibleW = visibleWidthFraction(sourceAspect, paneAspect)
  const visibleH = visibleHeightFraction(sourceAspect, paneAspect)
  return {
    sx: (1 - visibleW) / 2,
    sy: (1 - visibleH) / 2,
    sw: visibleW,
    sh: visibleH,
  }
}

/** Draws an image's source-fraction sub-rect into a destination rect, in pixel space. */
const drawCover = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sourceAspect: number,
  paneAspect: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void => {
  const { sx, sy, sw, sh } = coverSrcRect(sourceAspect, paneAspect)
  ctx.drawImage(
    img,
    sx * img.naturalWidth, sy * img.naturalHeight, sw * img.naturalWidth, sh * img.naturalHeight,
    dx, dy, dw, dh,
  )
}

const iconFont = "64px 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif"
const hudFont = "28px 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif"

const withIconStyle = (ctx: CanvasRenderingContext2D): void => {
  ctx.font = iconFont
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#fff'
  // The backdrops are hand-drawn art in warm mid-tones now, not flat placeholder fills, so an
  // unshadowed glyph can vanish against a lit wall or a pale door.
  ctx.shadowBlur = 6
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 2
  ctx.shadowColor = '#000'
}

const withHudStyle = (ctx: CanvasRenderingContext2D): void => {
  ctx.font = hudFont
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#fff'
  ctx.shadowBlur = 3
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.shadowColor = '#000'
}

const clearShadow = (ctx: CanvasRenderingContext2D): void => {
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
}

/**
 * Draws a room: backdrop, inhabitant, exit overlays, treasure, windlass, pickup overlay, HUD —
 * in that order.
 *
 * Order matters and is preserved from the Kotlin original: the character is drawn over the
 * backdrop but *under* the exit overlays, so a locked-door marker is never hidden behind a
 * character.
 */
export const drawRoom = (ctx: CanvasRenderingContext2D, opts: DrawRoomOptions): void => {
  const { room, layout, inventory, coinsCollected, score, elapsedMillis, width: w, height: h, images } = opts
  const lock = opts.lock ?? TREASURE_OPEN

  // Background image, center-cropped rather than stretched to fill. Stretching squashed every
  // asset by a different factor depending on its aspect, distorting door shape; a uniform
  // cover-scale keeps doors the proportions they were drawn at.
  // A windlass chamber gets its own backdrop regardless of the theme rotation: the room's ROLE
  // is what matters, and a player must recognise it the moment they walk in.
  const bgName =
    lock.type === 'Barred' && lock.windlassRoomIds.has(room.id)
      ? 'room_deadend_windlass_chamber'
      : themedAssetName(computeAssetName(room.exits, layout), room.id)

  const bg = images.get(bgName)
  // Missing image: skip the backdrop rather than throw. A half-drawn room beats a blank one.
  //
  // This departs from Kotlin, where loadBitmap always returns *something* (falling back to
  // room_deadend, then a 1x1 bitmap) so sourceAspect is always the real asset's aspect. Here
  // `images.get` is synchronous and returns undefined until the async load resolves, so there is
  // no aspect to read yet. Falling back to sourceAspect === paneAspect makes projectX/projectY
  // the identity — everything else this frame (character, doors, treasure) draws at its
  // *un-cropped* source fraction, which is a reasonable first frame and self-corrects the moment
  // the image lands and a later frame supplies the real aspect.
  const paneAspect = w / h
  const sourceAspect = bg ? bg.naturalWidth / bg.naturalHeight : paneAspect
  if (bg) {
    drawCover(ctx, bg, sourceAspect, paneAspect, 0, 0, w, h)
  }

  // Inhabitant, if this room has one. Drawn over the backdrop but *under* the exit overlays, so
  // a locked-door marker is never hidden behind a character.
  drawCharacter(ctx, room, bgName, w, h, sourceAspect, paneAspect, images)

  // Exit overlays
  drawExitOverlays(ctx, room, layout, w, h, sourceAspect, paneAspect)

  // Tappable coin or jewel, drawn over the backdrop so it reads as lying in the room.
  drawTreasure(ctx, room, w, h, sourceAspect, paneAspect, images)

  // The windlass, if this is one of the chambers that raises the treasure gate.
  drawWindlass(ctx, room, lock, w, h, sourceAspect, paneAspect, images)

  // Pickup / button overlay
  drawPickupOverlay(ctx, room, w, h)

  // HUD
  drawHud(ctx, inventory, coinsCollected, score, elapsedMillis, w, h, lock)
}

/**
 * Draws the room's inhabitant, if one is authored for this backdrop.
 *
 * Position, size and facing all come from PlacementMap — hand-placed against the actual artwork
 * rather than derived, so a character stands clear of that room's own furniture and not merely
 * clear of its doorways.
 */
const drawCharacter = (
  ctx: CanvasRenderingContext2D,
  room: Room,
  assetName: string,
  w: number,
  h: number,
  sourceAspect: number,
  paneAspect: number,
  images: ImageAssetManager,
): void => {
  const placement = PlacementMap.forRoom(PLACEMENTS, assetName, room.id)
  if (!placement) return
  const character = CharacterCatalog.ALL.find((c) => c.id === placement.character)
  if (!character) return
  const sprite = images.get(character.asset)
  if (!sprite) return

  // Placement fractions are authored against the *source* image, exactly like door positions,
  // so they have to go through the same crop projection the backdrop did. Drawing them straight
  // into screen space put the character's feet through the floor on a pane wider than
  // SPEC_ASPECT: the phone crops off some of the height, which is enough to push a figure
  // anchored near the bottom clean off the edge.
  const feetY = projectY(placement.feetY, sourceAspect, paneAspect)
  const headY = projectY(placement.feetY - placement.height, sourceAspect, paneAspect)
  const anchorX = projectX(placement.x, sourceAspect, paneAspect)

  const targetH = (feetY - headY) * h
  const targetW = targetH * (sprite.naturalWidth / sprite.naturalHeight)
  const left = w * anchorX - targetW / 2
  const top = h * feetY - targetH

  if (placement.flip) {
    ctx.save()
    // Reflect about the sprite's own centre so the flip does not also move it.
    const cx = left + targetW / 2
    ctx.translate(cx, 0)
    ctx.scale(-1, 1)
    ctx.translate(-cx, 0)
    ctx.drawImage(sprite, left, top, targetW, targetH)
    ctx.restore()
  } else {
    ctx.drawImage(sprite, left, top, targetW, targetH)
  }
}

const drawExitOverlays = (
  ctx: CanvasRenderingContext2D,
  room: Room,
  layout: ExitLayout,
  w: number,
  h: number,
  sourceAspect: number,
  paneAspect: number,
): void => {
  // Positions come from RoomGeometry so labels land on the doors the art actually draws,
  // projected through the same crop the backdrop just went through.
  const doorX = doorScreenX(sourceAspect, paneAspect)
  const doorY = projectY(DOOR_CENTER_Y, sourceAspect, paneAspect)
  const positions: ReadonlyArray<readonly [Direction, number, number]> = [
    [layout.left, w * doorX[0]!, h * doorY],
    [layout.center, w * doorX[1]!, h * doorY],
    [layout.right, w * doorX[2]!, h * doorY],
  ]

  withIconStyle(ctx)
  for (const [dir, x, y] of positions) {
    const exit = room.exits.get(dir)
    if (!exit) continue
    // Only states the artwork cannot convey get a marker. A door that is simply there, open or
    // closed, is obvious from the backdrop — labelling it "[DOOR]" just wrote over the art.
    // What the art cannot show is that an exit needs something the player has to go and find:
    //   LOCKED      — needs a key
    //   closed Gate — needs its button pressed, and a tap on it is silently ignored, so without
    //                 a marker it is an invisible dead end.
    let label: string | null
    if (exit.type === 'Absent') {
      continue
    } else if (exit.type === 'Door') {
      if (exit.state === 'OPEN' || exit.state === 'CLOSED') continue
      label = '\u{1F512}' // LOCKED
    } else {
      // The treasure gate carries no marker: tapping it opens a message that explains what
      // raises it, which is far more use than a chain glyph. Ordinary gates are gone, so in
      // practice this only ever matches the treasure.
      if (exit.open) continue
      if (exit.pairId === TREASURE_GATE_ID) continue
      label = '⛓' // chains
    }
    ctx.fillText(label, x, y)
  }
  clearShadow(ctx)
}

/**
 * Draws the room's coin or jewel, if it still holds one.
 *
 * Position comes from RoomTreasure, derived from the room id, and is projected through the same
 * centre-crop as everything else — a position in source fractions drawn straight into screen
 * space drifts on a pane whose aspect differs from SPEC_ASPECT.
 */
const drawTreasure = (
  ctx: CanvasRenderingContext2D,
  room: Room,
  w: number,
  h: number,
  sourceAspect: number,
  paneAspect: number,
  images: ImageAssetManager,
): void => {
  const treasure = roomTreasureFor(room.id, room.pickup)
  if (!treasure) return
  const sprite = images.get(treasure.asset)
  if (!sprite) return
  // The key is drawn larger than a coin: it is the objective on a MEDIUM maze.
  const size = h * (treasure.isKey ? KEY_HEIGHT_FRACTION : TREASURE_HEIGHT_FRACTION)
  const cx = w * projectX(treasure.x, sourceAspect, paneAspect)
  const cy = h * projectY(treasure.y, sourceAspect, paneAspect)
  const half = size / 2
  const aspect = sprite.naturalWidth / sprite.naturalHeight
  const dw = half * aspect * 2
  const dh = half * 2
  ctx.drawImage(sprite, cx - half * aspect, cy - half, dw, dh)
}

/**
 * Draws the winch in a windlass chamber.
 *
 * Centred and large, unlike a coin: this is the point of the room, not a thing to spot. The
 * backdrop is deliberately drawn with an EMPTY cradle so the sprite is the only winch —
 * generating a room that already contained one produced two stacked drums.
 */
const drawWindlass = (
  ctx: CanvasRenderingContext2D,
  room: Room,
  lock: TreasureLock,
  w: number,
  h: number,
  sourceAspect: number,
  paneAspect: number,
  images: ImageAssetManager,
): void => {
  if (lock.type !== 'Barred' || !lock.windlassRoomIds.has(room.id)) return
  const sprite = images.get('pickup_windlass')
  if (!sprite) return
  const targetH = h * WINDLASS_HEIGHT_FRACTION
  const targetW = targetH * (sprite.naturalWidth / sprite.naturalHeight)
  const cx = w * projectX(WINDLASS_X, sourceAspect, paneAspect)
  const feet = h * projectY(WINDLASS_FEET_Y, sourceAspect, paneAspect)

  // A raised windlass is drawn dimmed, so a returning player can see at a glance that this
  // chamber is done without having to tap it.
  const dimmed = lock.completed.has(room.id)
  const priorAlpha = ctx.globalAlpha
  if (dimmed) ctx.globalAlpha = 110 / 255
  ctx.drawImage(sprite, cx - targetW / 2, feet - targetH, targetW, targetH)
  if (dimmed) ctx.globalAlpha = priorAlpha
}

/**
 * Marks what a room holds, for the things with no art of their own.
 *
 * Coins are deliberately absent: they are drawn as an actual coin or jewel by drawTreasure, so a
 * "[COIN]" label beside the sprite was pure duplication — the same mistake the door overlays
 * made before they were cut back to only the states the art cannot show.
 *
 * Keys, hints and buttons keep a marker because they still have none. They auto-collect on entry
 * (or, for a button, need a press), so the marker is the only thing telling the player why their
 * inventory changed or that there is anything here to press.
 */
const drawPickupOverlay = (ctx: CanvasRenderingContext2D, room: Room, w: number, h: number): void => {
  let label: string
  // Key omitted: it is drawn as an actual key by drawTreasure now, and a glyph beside the
  // sprite is the same duplication "[COIN]" was.
  if (room.pickup.type === 'Hint') {
    label = '\u{1F4A1}' // 💡
  } else if (room.buttonGatePairId !== null) {
    label = '\u{1F518}' // 🔘
  } else {
    return
  }
  withIconStyle(ctx)
  ctx.fillText(label, w * 0.5, h * 0.78)
  clearShadow(ctx)
}

const drawHud = (
  ctx: CanvasRenderingContext2D,
  inventory: Inventory,
  coinsCollected: number,
  score: number,
  elapsedMillis: number,
  w: number,
  h: number,
  lock: TreasureLock,
): void => {
  const minutes = Math.floor(elapsedMillis / 60000)
  const seconds = Math.floor((elapsedMillis % 60000) / 1000)
  const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`
  // The windlass tally only appears on a barred maze, where it is the one piece of progress a
  // player cannot otherwise see without walking back to a chamber.
  const windlass =
    lock.type === 'Barred' ? `  Windlass:${lock.completed.size}/${lock.windlassRoomIds.size}` : ''
  const text =
    `Keys:${inventory.keys}  Hints:${inventory.hints}  Coins:${coinsCollected}${windlass}  ${timeStr}  Score:${score}`
  withHudStyle(ctx)
  ctx.fillText(text, w / 2, h - 12)
  clearShadow(ctx)
}
