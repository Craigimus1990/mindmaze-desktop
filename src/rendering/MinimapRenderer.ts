import type { Direction } from '../engine/model/Direction'
import { GRID_SIZE, opposite } from '../engine/model/Direction'
import type { Maze } from '../engine/model/Maze'
import type { Pickup } from '../engine/model/Room'
import type { ImageAssetManager } from './ImageAssetManager'

export interface MinimapOptions {
  readonly maze: Maze
  readonly currentRoomId: number
  readonly visitedRoomIds: ReadonlySet<number>
  readonly width: number
  readonly height: number
  /**
   * The direction pointing *back* the way the player came, as tracked by the game state. The
   * facing arrow points the opposite way — where the player is looking. Undefined in the start
   * room, where the room view faces NORTH by convention (see `forEntry`), so the arrow matches
   * that.
   */
  readonly entryDirection?: Direction | null
  /**
   * Unused by this renderer today — the Kotlin original draws the minimap entirely with paint
   * shapes, no bitmaps. Kept in the signature so callers pass the same `images` bag they pass to
   * `drawRoom`, in case a future minimap wants art (e.g. a treasure icon) without a signature
   * change.
   */
  readonly images?: ImageAssetManager
}

const isKey = (p: Pickup): boolean => p.type === 'Key'

/** A small key glyph, drawn over a visited room that still holds the key. */
const drawKeyMark = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void => {
  const r = Math.min(w, h)
  const cx = x + w / 2
  const cy = y + h / 2
  ctx.fillStyle = 'rgb(240, 200, 60)'
  // A ring and a stem: legible at a cell size of a few pixels, where a real key sprite would
  // be mud.
  ctx.beginPath()
  ctx.arc(cx, cy - r * 0.12, r * 0.18, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(cx - r * 0.05, cy - r * 0.02, r * 0.1, r * 0.32)
}

const neighborId = (roomId: number, dir: Direction): number => {
  switch (dir) {
    case 'NORTH': return roomId - GRID_SIZE
    case 'SOUTH': return roomId + GRID_SIZE
    case 'EAST': return roomId + 1
    case 'WEST': return roomId - 1
  }
}

// Exit markers, drawn on every visited room's edges so the map can be used to plan a route, not
// just to locate the player. Green = passable now, red = not. Locked uses a darker red than
// closed: both block the player, but closed only needs a right answer while locked needs a key,
// and that difference decides whether a detour is worth it.
const OPEN_EXIT_COLOR = 'rgb(80, 220, 120)'
const CLOSED_EXIT_COLOR = 'rgb(235, 90, 90)'
const LOCKED_EXIT_COLOR = 'rgb(150, 30, 40)'
// Gates flip in pairs, so "passable right now" is real but volatile — blue keeps them from
// reading as a permanent wall.
const GATE_EXIT_COLOR = 'rgb(120, 170, 255)'

const drawRoomExits = (
  ctx: CanvasRenderingContext2D,
  maze: Maze,
  roomId: number,
  padX: number,
  padY: number,
  cellSize: number,
): void => {
  const room = maze.rooms.get(roomId)
  if (!room) return
  const x = padX + (roomId % GRID_SIZE) * cellSize
  const y = padY + Math.floor(roomId / GRID_SIZE) * cellSize

  // Short bar centred on the edge the exit leads through. Kept thin so that the two markers
  // on a shared wall — one from each adjacent visited room — both stay legible.
  //
  // Those two markers can currently disagree: the engine's door-state update only touches the
  // room the player is standing in, while maze generation writes every door into both rooms, so
  // opening a door leaves the far side recorded as CLOSED/LOCKED. That is an engine bug, not a
  // rendering one; the map reports what the state actually says.
  const len = cellSize * 0.4
  const thick = Math.max(2, cellSize * 0.11)

  for (const [dir, exit] of room.exits) {
    if (exit.type === 'Absent') continue
    const color =
      exit.type === 'Gate'
        ? GATE_EXIT_COLOR
        : exit.state === 'OPEN'
          ? OPEN_EXIT_COLOR
          : exit.state === 'CLOSED'
            ? CLOSED_EXIT_COLOR
            : LOCKED_EXIT_COLOR

    const cx = x + cellSize / 2
    const cy = y + cellSize / 2
    let rx: number, ry: number, rw: number, rh: number
    switch (dir) {
      case 'NORTH': rx = cx - len / 2; ry = y; rw = len; rh = thick; break
      case 'SOUTH': rx = cx - len / 2; ry = y + cellSize - thick; rw = len; rh = thick; break
      case 'WEST': rx = x; ry = cy - len / 2; rw = thick; rh = len; break
      case 'EAST': rx = x + cellSize - thick; ry = cy - len / 2; rw = thick; rh = len; break
    }
    ctx.fillStyle = color
    ctx.fillRect(rx, ry, rw, rh)
  }
}

/** Triangle in the current cell pointing the way the player is looking. */
const drawFacing = (
  ctx: CanvasRenderingContext2D,
  currentId: number,
  entryDirection: Direction | null | undefined,
  padX: number,
  padY: number,
  cellSize: number,
): void => {
  // entryDirection points back the way the player came; they face the other way. The start
  // room has no entry, and its room view faces NORTH by convention.
  const facing = entryDirection ? opposite(entryDirection) : 'NORTH'

  const cx = padX + (currentId % GRID_SIZE) * cellSize + cellSize / 2
  const cy = padY + Math.floor(currentId / GRID_SIZE) * cellSize + cellSize / 2
  const r = cellSize * 0.22

  // Tip and base sit an equal distance either side of the cell centre, so the triangle's
  // bounding box is centred on the cell rather than pushed toward the facing wall (which
  // otherwise makes it overlap the exit marker on that edge).
  const half = r * 0.75
  const wing = r * 0.8
  let tipX: number, tipY: number
  switch (facing) {
    case 'NORTH': tipX = cx; tipY = cy - half; break
    case 'SOUTH': tipX = cx; tipY = cy + half; break
    case 'EAST': tipX = cx + half; tipY = cy; break
    case 'WEST': tipX = cx - half; tipY = cy; break
  }
  let base: [number, number, number, number]
  switch (facing) {
    case 'NORTH': base = [cx - wing, cy + half, cx + wing, cy + half]; break
    case 'SOUTH': base = [cx - wing, cy - half, cx + wing, cy - half]; break
    case 'EAST': base = [cx - half, cy - wing, cx - half, cy + wing]; break
    case 'WEST': base = [cx + half, cy - wing, cx + half, cy + wing]; break
  }

  const path = new Path2D()
  path.moveTo(tipX, tipY)
  path.lineTo(base[0], base[1])
  path.lineTo(base[2], base[3])
  path.closePath()

  // Outline first, then fill inset, so the arrow reads against the cyan cell.
  ctx.strokeStyle = '#000'
  ctx.lineWidth = Math.max(3, cellSize * 0.09)
  ctx.stroke(path)
  ctx.fillStyle = '#fff'
  ctx.fill(path)
}

export const drawMinimap = (ctx: CanvasRenderingContext2D, opts: MinimapOptions): void => {
  const { maze, currentRoomId, visitedRoomIds, width, height, entryDirection } = opts
  void opts.images // not used yet; see MinimapOptions.images doc
  const cellSize = Math.min(width, height) / 10
  const padX = (width - cellSize * 10) / 2
  const padY = (height - cellSize * 10) / 2

  for (let roomId = 0; roomId < 100; roomId++) {
    // Cells outside the maze are skipped entirely rather than drawn dim. Generation is a
    // spanning tree now, so 15-70 of the grid's 100 cells are not part of the maze at all;
    // painting them as unvisited rooms invited a child to hunt for a way in.
    const room = maze.rooms.get(roomId)
    if (!room) continue
    const col = roomId % GRID_SIZE
    const row = Math.floor(roomId / GRID_SIZE)
    const x = padX + col * cellSize
    const y = padY + row * cellSize
    const rx = x + 1
    const ry = y + 1
    const rw = cellSize - 2
    const rh = cellSize - 2

    const color =
      roomId === currentRoomId
        ? '#0ff' // cyan
        : roomId === maze.startId
          ? '#0f0' // green
          : roomId === maze.treasureId
            ? '#ff0' // yellow
            : visitedRoomIds.has(roomId)
              ? '#d3d3d3' // lightgray
              : 'rgba(200, 200, 200, 0.235)' // Color.argb(60, 200, 200, 200)

    ctx.fillStyle = color
    ctx.fillRect(rx, ry, rw, rh)

    // A key the player has seen but not taken is marked, so walking past one is recoverable —
    // it is the only key in the maze and the treasure door needs it. Only once visited:
    // flagging it beforehand would turn the search into an errand.
    if (visitedRoomIds.has(roomId) && isKey(room.pickup)) {
      drawKeyMark(ctx, rx, ry, rw, rh)
    }

    // Draw corridor lines for visited rooms
    if (visitedRoomIds.has(roomId) || roomId === currentRoomId) {
      for (const [dir, exit] of room.exits) {
        if (exit.type === 'Absent') continue
        const nId = neighborId(roomId, dir)
        if (visitedRoomIds.has(nId) || nId === currentRoomId) {
          const nCol = nId % GRID_SIZE
          const nRow = Math.floor(nId / GRID_SIZE)
          const nx = padX + nCol * cellSize + cellSize / 2
          const ny = padY + nRow * cellSize + cellSize / 2
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(x + cellSize / 2, y + cellSize / 2)
          ctx.lineTo(nx, ny)
          ctx.stroke()
        }
      }
    }
  }

  // Drawn last so they sit above the corridor lines. Corridor lines only connect rooms the
  // player has already been to; these markers also show exits leading somewhere unvisited,
  // which is what makes the map usable for choosing where to go next.
  const withCurrent = new Set(visitedRoomIds)
  withCurrent.add(currentRoomId)
  for (const roomId of withCurrent) {
    drawRoomExits(ctx, maze, roomId, padX, padY, cellSize)
  }
  drawFacing(ctx, currentRoomId, entryDirection, padX, padY, cellSize)
}
