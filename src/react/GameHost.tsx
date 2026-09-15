import { useCallback, useEffect, useRef } from 'react'
import { computeScore } from '../engine/engine/ScoreCalculator'
import type { Direction } from '../engine/model/Direction'
import type { Room } from '../engine/model/Room'
import type { TreasureLock } from '../engine/model/Maze'
import { assetName, themedAssetName } from '../rendering/backdropName'
import { drawMinimap } from '../rendering/MinimapRenderer'
import { drawRoom } from '../rendering/RoomRenderer'
import type { ImageAssetManager } from '../rendering/ImageAssetManager'
import { projectX, projectY, tapBoundaries } from '../rendering/RoomGeometry'
import { HIT_RADIUS, roomTreasureFor, treasurePoints } from '../rendering/RoomTreasure'
import type { PlayerAction } from '../ui/PlayerAction'
import type { UiState } from '../ui/UiState'
import { forEntry, type ExitLayout } from '../util/ExitLayout'

/**
 * Fixed internal resolution the canvases draw at, scaled to fit by CSS.
 *
 * Drawing at a fixed size and letting CSS scale it keeps every fraction-based coordinate in the
 * renderers meaningful at any window size, and makes the geometry independent of the window —
 * which is what lets doors stay aligned while the window is resized. The aspect (1280x800 = 1.6)
 * is close to the room pane's own working range; the renderers cover-crop to whatever they get,
 * so nothing here has to match an asset exactly.
 */
const CANVAS_WIDTH = 1280
const CANVAS_HEIGHT = 800

/** The room pane takes 70% of the width, matching Kotlin's `weight(0.7f)`; the minimap has the
 *  rest. Split here rather than with two CSS-sized elements so both canvases share one
 *  device-pixel scaling pass and the fractions the hit-testing uses are exact. */
const ROOM_FRACTION = 0.7

const ROOM_WIDTH = CANVAS_WIDTH * ROOM_FRACTION
const MINIMAP_WIDTH = CANVAS_WIDTH - ROOM_WIDTH

/**
 * Maps a click in the room pane to an action.
 *
 * Boundaries come from {@link tapBoundaries}, the same calibration that places the drawn
 * overlays, so each door owns the region nearest it and clicks agree with what the player sees.
 * They are computed rather than hardcoded: the previous constants (0.34/0.67) were justified as
 * the midpoints of door positions the art had since moved away from.
 *
 * `paneWidth` must be the room pane's own width (70% of the full canvas), not the full canvas
 * width — everything below works in fractions of the pane.
 *
 * Exported for the keyboard path to share nothing with: keyboard produces directions directly.
 * It is exported so a future test can drive it without a canvas.
 */
export const handleTap = (
  paneX: number,
  paneY: number,
  paneWidth: number,
  paneHeight: number,
  sourceAspect: number,
  layout: ExitLayout,
  room: Room,
  lock: TreasureLock,
  onAction: (action: PlayerAction) => void,
): void => {
  if (paneWidth <= 0 || paneHeight <= 0) return
  const paneAspect = paneWidth / paneHeight
  const fx = paneX / paneWidth
  const fy = paneY / paneHeight

  // The windlass is checked before anything else. It is drawn large and centred, so it
  // deliberately overlaps the centre door's click region — but a windlass chamber is a dead end
  // with no centre door, so nothing is stolen.
  if (lock.type === 'Barred' && lock.windlassRoomIds.has(room.id)) {
    const wx = projectX(0.5, sourceAspect, paneAspect)
    const wy = projectY(0.7, sourceAspect, paneAspect)
    const dx = fx - wx
    const dy = fy - wy
    if (dx * dx + dy * dy <= 0.22 * 0.22) {
      onAction({ type: 'TurnWindlass' })
      return
    }
  }

  // Treasure is checked next, and wins over the doors. The room pane doubles as the movement
  // control, so a coin and a door can both claim the same click; a coin is deliberately kept
  // clear of every door centre by more than its own hit radius (see RoomTreasure), so this can
  // never swallow a click the player meant for a doorway.
  const treasure = roomTreasureFor(room.id, room.pickup)
  if (treasure !== null) {
    const tx = projectX(treasure.x, sourceAspect, paneAspect)
    const ty = projectY(treasure.y, sourceAspect, paneAspect)
    // Compare in projected screen space, which is where the player's pointer actually is.
    const dx = fx - tx
    const dy = fy - ty
    if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
      onAction({ type: 'CollectTreasure', points: treasurePoints(treasure) })
      return
    }
  }

  const [leftEdge, rightEdge] = tapBoundaries(sourceAspect, paneAspect)
  const direction: Direction =
    fx < leftEdge ? layout.left : fx < rightEdge ? layout.center : layout.right

  const exit = room.exits.get(direction)
  if (exit === undefined) return
  switch (exit.type) {
    case 'Absent':
      return
    case 'Door':
      onAction(
        exit.state === 'OPEN'
          ? { type: 'Move', direction }
          : { type: 'AttemptDoor', direction },
      )
      return
    // A closed gate used to return silently, which is why clicking the barred treasure door did
    // nothing at all: the engine never saw the click, so it never got to explain what raises it.
    // Move is the right action either way — the engine decides, and for a closed treasure gate
    // it answers with TreasureBlocked.
    case 'Gate':
      onAction({ type: 'Move', direction })
      return
  }
}

/**
 * Maps a keystroke to the same {@link PlayerAction} the mouse would produce.
 *
 * Additive, not alternative: every key routes through `dispatch` exactly as a click does, so the
 * two input paths cannot diverge in behaviour. That invariant is what let the Android app add
 * voice as a third path safely — it fed the same actions rather than reaching past them.
 *
 * Arrows and WASD name a *screen* slot (left/ahead/right), not a compass direction, because that
 * is what the player sees; `layout` resolves the slot to the direction the room actually uses.
 * Down/S walks back the way the player came, matching the Back button.
 *
 * Returns null when the key means nothing in this state, so the caller can leave the event alone.
 */
export const actionForKey = (
  key: string,
  state: UiState,
  layout: ExitLayout,
  room: Room | undefined,
): PlayerAction | null => {
  const k = key.length === 1 ? key.toUpperCase() : key

  // While a question is up the only live controls are the dialog's own. A movement key heard
  // here is not harmless: it would reach engine.move(), which with a trivia direction already
  // pending emits a *fresh* TriviaRequired and swaps the question out from under the player
  // mid-read. (Kotlin's voice path restricts itself the same way, for the same reason.)
  if (state.type === 'Trivia') {
    if (k >= 'A' && k <= 'D') {
      const index = k.charCodeAt(0) - 'A'.charCodeAt(0)
      // A hint narrows the displayed list to two, and "C" then names an option that is not on
      // screen — the engine would grade it as a plain wrong answer and burn the question, an
      // outcome no button on screen can produce. Ignore it instead.
      return index < state.answers.length ? { type: 'SubmitAnswer', index } : null
    }
    if (k === 'H') return { type: 'UseHint' }
    return null
  }

  if (state.type !== 'InGame') return null

  /** Left/ahead/right resolve through the layout; the exit's own state picks Move vs AttemptDoor,
   *  exactly as {@link handleTap} does after resolving a click to a direction. */
  const towards = (direction: Direction): PlayerAction | null => {
    const exit = room?.exits.get(direction)
    if (exit === undefined || exit.type === 'Absent') return null
    if (exit.type === 'Gate') return { type: 'Move', direction }
    return exit.state === 'OPEN'
      ? { type: 'Move', direction }
      : { type: 'AttemptDoor', direction }
  }

  switch (k) {
    case 'ArrowLeft':
    case 'A':
      return towards(layout.left)
    case 'ArrowUp':
    case 'W':
      return towards(layout.center)
    case 'ArrowRight':
    case 'D':
      return towards(layout.right)
    case 'ArrowDown':
    case 'S':
      return { type: 'MoveBack' }
    case 'H':
      return { type: 'UseHint' }
    case 'K':
      return { type: 'UseKey' }
    case 'P':
      return { type: 'PressButton' }
    default:
      return null
  }
}

export interface GameHostProps {
  /** The playable state to draw. Trivia and Message draw the room behind their dialog, so all
   *  three variants reach here. */
  readonly state: Extract<UiState, { type: 'InGame' | 'Trivia' | 'Message' }>
  readonly images: ImageAssetManager
  readonly dispatch: (action: PlayerAction) => void
  /** Escape dismisses a story message; there is no other way out of one from the keyboard. */
  readonly onDismissMessage: () => void
}

/**
 * The canvas pair: the first-person room on the left, the minimap on the right.
 *
 * Both canvases are drawn at a fixed internal resolution multiplied by devicePixelRatio and
 * scaled down by CSS, so the art is sharp on a HiDPI display and the window can be any size
 * without the geometry moving. Every hit-test below runs against the *fixed* resolution after
 * converting the click through the element's measured rect, which is what keeps doors and their
 * click regions aligned at every window size.
 */
export const GameHost = ({ state, images, dispatch, onDismissMessage }: GameHostProps) => {
  const roomCanvas = useRef<HTMLCanvasElement | null>(null)
  const minimapCanvas = useRef<HTMLCanvasElement | null>(null)

  const game = state.game
  const room = game.maze.rooms.get(game.currentRoomId)
  const layout = forEntry(state.entryDirection ?? null)

  // Hit boundaries depend on how the backdrop was cropped, which depends on the asset's own
  // aspect — so hit-testing has to know which asset the renderer picked for this room. Read off
  // the decoded image rather than a separate lookup, so the two can never disagree.
  const backdrop = room
    ? images.get(themedAssetName(assetName(room.exits, layout), room.id))
    : undefined
  const paneAspect = ROOM_WIDTH / CANVAS_HEIGHT
  const sourceAspect = backdrop ? backdrop.naturalWidth / backdrop.naturalHeight : paneAspect

  useEffect(() => {
    const canvas = roomCanvas.current
    if (canvas === null || room === undefined) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = ROOM_WIDTH * dpr
    canvas.height = CANVAS_HEIGHT * dpr
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const score = computeScore(
      game.coinsCollected, game.correctAnswers, game.elapsedMillis, game.treasureBonus,
    ).total
    drawRoom(ctx, {
      room,
      layout,
      inventory: game.inventory,
      coinsCollected: game.coinsCollected,
      score,
      elapsedMillis: game.elapsedMillis,
      width: ROOM_WIDTH,
      height: CANVAS_HEIGHT,
      lock: game.maze.treasureLock,
      images,
    })
  }, [room, layout, game, images])

  useEffect(() => {
    const canvas = minimapCanvas.current
    if (canvas === null) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = MINIMAP_WIDTH * dpr
    canvas.height = CANVAS_HEIGHT * dpr
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    drawMinimap(ctx, {
      maze: game.maze,
      currentRoomId: game.currentRoomId,
      visitedRoomIds: game.visitedRoomIds,
      width: MINIMAP_WIDTH,
      height: CANVAS_HEIGHT,
      entryDirection: state.entryDirection,
      images,
    })
  }, [game, state.entryDirection, images])

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): void => {
      // Only the room pane is interactive, and only while the player is actually in the room —
      // a click landing behind an open dialog must not walk them through a door they cannot see.
      if (state.type !== 'InGame' || room === undefined) return
      const rect = e.currentTarget.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      // Convert the click from the element's on-screen size back into the fixed internal
      // resolution the geometry is defined in — the element is CSS-scaled, so these differ.
      const paneX = ((e.clientX - rect.left) / rect.width) * ROOM_WIDTH
      const paneY = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT
      handleTap(
        paneX, paneY, ROOM_WIDTH, CANVAS_HEIGHT,
        sourceAspect, layout, room, game.maze.treasureLock, dispatch,
      )
    },
    [state.type, room, sourceAspect, layout, game.maze.treasureLock, dispatch],
  )

  // Registered on the window rather than a focusable element: the game is the whole window and
  // there is nothing else to type into while playing, so requiring a click to focus first would
  // make the keyboard silently dead on launch.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') {
        if (state.type === 'Message') {
          e.preventDefault()
          onDismissMessage()
        }
        return
      }
      const action = actionForKey(e.key, state, layout, room)
      if (action === null) return
      e.preventDefault()
      dispatch(action)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state, layout, room, dispatch, onDismissMessage])

  return (
    <div className="game-host">
      <div className="game-panes" style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}>
        <canvas
          ref={roomCanvas}
          className="room-canvas"
          style={{ flex: ROOM_FRACTION }}
          onClick={onClick}
        />
        <canvas
          ref={minimapCanvas}
          className="minimap-canvas"
          style={{ flex: 1 - ROOM_FRACTION }}
        />
      </div>

      {state.type === 'InGame' && state.toast ? (
        <div className="toast">{state.toast}</div>
      ) : null}

      {/*
        Dead-end rooms have no exit overlays, so without Back the player has no pointer
        affordance to leave one — the maze becomes unwinnable by mouse alone. Hidden in the
        start room, where entryDirection is null and there is nothing to go back to: dispatch
        early-returns on MoveBack there, so a visible button would silently do nothing.

        Press Button is here for the same reason: MazeGenerator really does place buttons, and
        each gate pair is generated with exactly one side open, so a gate can block the route
        outright.
      */}
      {state.type === 'InGame' ? (
        <div className="room-controls">
          {state.entryDirection != null ? (
            <button type="button" onClick={() => dispatch({ type: 'MoveBack' })}>← Back</button>
          ) : null}
          {room?.buttonGatePairId != null ? (
            <button type="button" onClick={() => dispatch({ type: 'PressButton' })}>
              Press Button
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
