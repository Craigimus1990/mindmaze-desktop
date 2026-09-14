import type { Direction } from '../model/Direction'
import { directionOffset, opposite } from '../model/Direction'
import type { GameState } from '../model/GameState'
import type { Maze, TreasureLock } from '../model/Maze'
import { QUESTIONS_PER_WINDLASS, isRaised } from '../model/Maze'
import type { ExitType, Room } from '../model/Room'
import { ABSENT, PICKUP_COIN, PICKUP_HINT, PICKUP_KEY, PICKUP_NONE, door } from '../model/Room'
import type { DoorState } from '../model/types'
import type { GameEvent } from './GameEvent'
import { TREASURE_GATE_ID } from './constants'
import { COIN_POINTS } from './ScoreCalculator'
import type { TriviaRepository } from './TriviaRepository'

/** Narrow a lock to Barred, or null. Kotlin's `as? TreasureLock.Barred`. */
const asBarred = (
  lock: TreasureLock,
): Extract<TreasureLock, { type: 'Barred' }> | null =>
  lock.type === 'Barred' ? lock : null

export class GameEngine {
  private state: GameState
  private readonly triviaRepo: TriviaRepository

  /**
   * The direction that triggered a pending trivia challenge, if any.
   *
   * Deliberately an instance field rather than part of GameState: it is NOT persisted, so a game
   * saved mid-trivia reloads having forgotten the pending question. This matches Android exactly
   * and is intentional — do not "fix" it by folding it into GameState.
   */
  private pendingTriviaDirection: Direction | null = null

  /**
   * The windlass room whose question is currently on screen, if any.
   *
   * Not persisted — see the note on pendingTriviaDirection.
   */
  private pendingWindlassRoom: number | null = null

  /**
   * Whether the windlass rules have been explained yet this session.
   *
   * Not persisted — see the note on pendingTriviaDirection. A reload re-explains the rules.
   */
  private windlassExplained = false

  constructor(state: GameState, triviaRepo: TriviaRepository) {
    this.state = state
    this.triviaRepo = triviaRepo
  }

  getState(): GameState {
    return this.state
  }

  /** The windlass room the player is standing in, or null if this room has none. */
  private currentWindlass(): number | null {
    const lock = this.state.maze.treasureLock
    if (lock.type !== 'Barred') return null
    return lock.windlassRoomIds.has(this.state.currentRoomId)
      ? this.state.currentRoomId
      : null
  }

  /**
   * Begins (or continues) turning the windlass in the current room.
   *
   * Presents one trivia question; [answerWindlass] then banks or discards the progress. Kept
   * separate from the door-trivia path because the stakes differ: a door question can be
   * retried freely, whereas a windlass question can undo work already done.
   */
  turnWindlass(): GameEvent[] {
    const lock = asBarred(this.state.maze.treasureLock)
    if (lock === null) {
      return [{ type: 'InvalidAction', reason: 'Nothing to turn here' }]
    }
    const roomId = this.currentWindlass()
    if (roomId === null) {
      return [{ type: 'InvalidAction', reason: 'Nothing to turn here' }]
    }
    if (lock.completed.has(roomId)) {
      return [{ type: 'WindlassAlreadyRaised', roomId }]
    }
    const question = this.triviaRepo.nextQuestion()
    if (question === null) {
      return [{ type: 'InvalidAction', reason: 'No trivia questions available' }]
    }
    this.pendingWindlassRoom = roomId

    // Explain the rules on the first turn if the player has not seen them — they may have
    // resumed a save from mid-game, or entered the chamber before the explainer existed.
    // Emitted ALONGSIDE the question rather than instead of it: consuming the first tap just
    // to show a message means tapping twice to get started.
    const explainer: GameEvent[] = []
    if (!this.windlassExplained) {
      this.windlassExplained = true
      explainer.push({ type: 'WindlassChamberFound', roomId })
    }
    return [...explainer, { type: 'TriviaRequired', question, direction: 'NORTH' }]
  }

  /**
   * Resolves a windlass question.
   *
   * A wrong answer discards this windlass's progress entirely — three *consecutive* correct
   * answers are required. That is deliberately demanding and only ever applies on HARD.
   */
  answerWindlass(correct: boolean): GameEvent[] {
    const roomId = this.pendingWindlassRoom
    if (roomId === null) {
      return [{ type: 'InvalidAction', reason: 'No windlass question pending' }]
    }
    this.pendingWindlassRoom = null
    const lock = asBarred(this.state.maze.treasureLock)
    if (lock === null) {
      return [{ type: 'InvalidAction', reason: 'Nothing to turn here' }]
    }

    if (!correct) {
      const progress = new Map(this.state.windlassProgress)
      progress.delete(roomId)
      this.state = { ...this.state, windlassProgress: progress }
      return [{ type: 'WindlassSlipped', roomId }]
    }

    const banked = (this.state.windlassProgress.get(roomId) ?? 0) + 1
    this.state = {
      ...this.state,
      correctAnswers: this.state.correctAnswers + 1,
      windlassProgress: new Map(this.state.windlassProgress).set(roomId, banked),
    }
    if (banked < QUESTIONS_PER_WINDLASS) {
      // Must not be empty: the reducer folds events over the current state, so returning
      // nothing left the trivia dialog on screen with no way out.
      return [
        { type: 'WindlassProgressed', roomId, banked, needed: QUESTIONS_PER_WINDLASS },
      ]
    }

    // This windlass is done: record it and clear its working total.
    const completed = new Set(lock.completed).add(roomId)
    const raised: TreasureLock = { ...lock, completed }
    const clearedProgress = new Map(this.state.windlassProgress)
    clearedProgress.delete(roomId)
    this.state = {
      ...this.state,
      maze: { ...this.state.maze, treasureLock: raised },
      windlassProgress: clearedProgress,
    }
    const events: GameEvent[] = [
      {
        type: 'WindlassRaised',
        roomId,
        remaining: lock.windlassRoomIds.size - completed.size,
      },
    ]
    if (isRaised(raised)) {
      this.openTreasureGate()
      events.push({ type: 'TreasureGateOpened' })
    }
    return events
  }

  /** Opens every treasure gate in the maze, now that all the windlasses are raised. */
  private openTreasureGate(): void {
    const rooms = new Map<number, Room>()
    for (const [id, room] of this.state.maze.rooms) {
      const exits = new Map<Direction, ExitType>()
      for (const [dir, exit] of room.exits) {
        exits.set(
          dir,
          exit.type === 'Gate' && exit.pairId === TREASURE_GATE_ID
            ? { ...exit, open: true }
            : exit,
        )
      }
      rooms.set(id, { ...room, exits })
    }
    this.state = { ...this.state, maze: { ...this.state.maze, rooms } }
  }

  /**
   * Collect the coin in the current room, worth [points].
   *
   * Called when the player taps the coin drawn in the room. [points] comes from the UI because
   * it depends on whether the art is a coin or a jewel, which is derived from the room id in the
   * rendering layer — the engine deliberately knows nothing about which sprite was shown.
   *
   * Idempotent: a second tap on an already-collected coin does nothing, since a child will tap
   * a shiny thing more than once and must not score twice for it.
   */
  collectCoin(points: number): GameEvent[] {
    const room = this.state.maze.rooms.get(this.state.currentRoomId)
    if (room === undefined) {
      return [{ type: 'InvalidAction', reason: 'Current room not found' }]
    }
    // A key taps the same way a coin does but banks into the inventory rather than the
    // score. Routing both through one action keeps the tap handler from having to know which
    // kind of thing it just hit.
    if (room.pickup.type === 'Key') {
      this.state = {
        ...this.state,
        maze: {
          ...this.state.maze,
          rooms: new Map(this.state.maze.rooms).set(room.id, {
            ...room,
            pickup: PICKUP_NONE,
          }),
        },
        inventory: { ...this.state.inventory, keys: this.state.inventory.keys + 1 },
      }
      return [{ type: 'PickupCollected', pickup: PICKUP_KEY }]
    }
    if (room.pickup.type !== 'Coin') {
      return [{ type: 'InvalidAction', reason: 'Nothing to collect here' }]
    }
    const cleared: Room = { ...room, pickup: PICKUP_NONE }
    // The count feeds ScoreCalculator's coins * COIN_POINTS; anything a jewel is worth BEYOND
    // a plain coin goes into treasureBonus so it is not multiplied a second time.
    const bonus = Math.max(points - COIN_POINTS, 0)
    this.state = {
      ...this.state,
      maze: {
        ...this.state.maze,
        rooms: new Map(this.state.maze.rooms).set(room.id, cleared),
      },
      coinsCollected: this.state.coinsCollected + 1,
      treasureBonus: this.state.treasureBonus + bonus,
    }
    return [{ type: 'PickupCollected', pickup: PICKUP_COIN }]
  }

  /**
   * Attempt to move in [direction].
   * Returns a list of [GameEvent]s describing what happened.
   */
  move(direction: Direction): GameEvent[] {
    const currentRoom = this.state.maze.rooms.get(this.state.currentRoomId)
    if (currentRoom === undefined) {
      return [{ type: 'InvalidAction', reason: 'Current room not found' }]
    }

    const exit: ExitType = currentRoom.exits.get(direction) ?? ABSENT

    if (exit.type === 'Absent') {
      return [{ type: 'InvalidAction', reason: `No exit in direction ${direction}` }]
    }

    if (exit.type === 'Door') {
      switch (exit.state) {
        case 'OPEN': {
          const targetId = this.findAdjacentRoomId(this.state.currentRoomId, direction)
          if (targetId === null) {
            return [{ type: 'InvalidAction', reason: 'Target room not found' }]
          }
          return this.performMove(targetId)
        }

        case 'CLOSED': {
          const question = this.triviaRepo.nextQuestion()
          if (question === null) {
            return [{ type: 'InvalidAction', reason: 'No trivia questions available' }]
          }
          this.pendingTriviaDirection = direction
          return [{ type: 'TriviaRequired', question, direction }]
        }

        case 'LOCKED': {
          // A door into the treasure room refuses outright rather than offering
          // trivia. Every other locked door treats a correct answer as standing in for
          // the key, which for the treasure would let the player answer one question
          // and stroll in — defeating the entire point of hiding a key for them.
          const target = this.findAdjacentRoomId(this.state.currentRoomId, direction)
          if (target === this.state.maze.treasureId && this.state.inventory.keys === 0) {
            return [{ type: 'TreasureBlocked', lock: this.state.maze.treasureLock }]
          }
          if (this.state.inventory.keys > 0) {
            // Consume a key, open the door, then move
            this.state = {
              ...this.state,
              inventory: { ...this.state.inventory, keys: this.state.inventory.keys - 1 },
            }
            const updatedMaze = this.setDoorState(direction, 'OPEN')
            this.state = { ...this.state, maze: updatedMaze }
            const targetId = this.findAdjacentRoomId(this.state.currentRoomId, direction)
            if (targetId === null) {
              return [{ type: 'InvalidAction', reason: 'Target room not found' }]
            }
            const moveEvents = this.performMove(targetId)
            return [{ type: 'DoorUnlocked', direction }, ...moveEvents]
          }
          // No key — trivia gates entry (correct answer replaces key requirement)
          const question = this.triviaRepo.nextQuestion()
          if (question === null) {
            return [{ type: 'InvalidAction', reason: 'No trivia questions available' }]
          }
          this.pendingTriviaDirection = direction
          return [{ type: 'TriviaRequired', question, direction }]
        }
      }
    }

    // Gate.
    if (!exit.open) {
      // The treasure gate gets a message explaining what raises it; every other
      // closed gate is a button puzzle the player can already see.
      if (exit.pairId === TREASURE_GATE_ID) {
        return [{ type: 'TreasureBlocked', lock: this.state.maze.treasureLock }]
      }
      return [{ type: 'InvalidAction', reason: 'Gate is closed' }]
    }
    const targetId = this.findAdjacentRoomId(this.state.currentRoomId, direction)
    if (targetId === null) {
      return [{ type: 'InvalidAction', reason: 'Target room not found' }]
    }
    return this.performMove(targetId)
  }

  /**
   * Submit an answer to the pending trivia question.
   * [answerIndex] is the player's choice; [correctIndex] is the right answer index.
   */
  submitAnswer(answerIndex: number, correctIndex: number): GameEvent[] {
    if (answerIndex !== correctIndex) {
      this.pendingTriviaDirection = null
      return [{ type: 'WrongAnswer' }]
    }

    // Correct answer
    const direction = this.pendingTriviaDirection
    if (direction === null) {
      return [{ type: 'InvalidAction', reason: 'No pending trivia question' }]
    }
    this.pendingTriviaDirection = null

    const currentRoom = this.state.maze.rooms.get(this.state.currentRoomId)
    if (currentRoom === undefined) {
      return [{ type: 'InvalidAction', reason: 'Current room not found' }]
    }
    // Kotlin reads the exit here and then ignores it; the lookup exists only so a direction
    // with no exit at all bails out before the door is opened. Preserved as-is.
    if (currentRoom.exits.get(direction) === undefined) {
      return [{ type: 'InvalidAction', reason: `No exit in direction ${direction}` }]
    }

    // Open the door (CLOSED→OPEN or LOCKED→OPEN, key not consumed for trivia path)
    const updatedMaze = this.setDoorState(direction, 'OPEN')
    this.state = {
      ...this.state,
      maze: updatedMaze,
      correctAnswers: this.state.correctAnswers + 1,
    }

    const targetId = this.findAdjacentRoomId(this.state.currentRoomId, direction)
    if (targetId === null) {
      return [{ type: 'InvalidAction', reason: 'Target room not found' }]
    }

    const moveEvents = this.performMove(targetId)
    return [{ type: 'DoorOpened', newRoomId: targetId }, ...moveEvents]
  }

  /**
   * Press a button in the current room, toggling its associated gate pair.
   */
  pressButton(): GameEvent[] {
    const currentRoom = this.state.maze.rooms.get(this.state.currentRoomId)
    if (currentRoom === undefined) {
      return [{ type: 'InvalidAction', reason: 'Current room not found' }]
    }
    const pairId = currentRoom.buttonGatePairId
    if (pairId === null) {
      return [{ type: 'InvalidAction', reason: 'No button in this room' }]
    }

    // Toggle all Gate exits with this pairId across all rooms
    const updatedRooms = new Map<number, Room>()
    for (const [id, room] of this.state.maze.rooms) {
      const updatedExits = new Map<Direction, ExitType>()
      for (const [dir, exitType] of room.exits) {
        updatedExits.set(
          dir,
          exitType.type === 'Gate' && exitType.pairId === pairId
            ? { ...exitType, open: !exitType.open }
            : exitType,
        )
      }
      updatedRooms.set(id, { ...room, exits: updatedExits })
    }
    this.state = { ...this.state, maze: { ...this.state.maze, rooms: updatedRooms } }
    return [{ type: 'GateFlipped', gatePairId: pairId }]
  }

  /**
   * Use a hint from inventory. Returns InvalidAction if no hints remain.
   * Emits PickupCollected with Pickup.Hint to signal consumption (inventory decremented).
   */
  useHint(): GameEvent[] {
    if (this.state.inventory.hints === 0) {
      return [{ type: 'InvalidAction', reason: 'No hints remaining' }]
    }
    this.state = {
      ...this.state,
      inventory: { ...this.state.inventory, hints: this.state.inventory.hints - 1 },
    }
    return [{ type: 'PickupCollected', pickup: PICKUP_HINT }]
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Move the player to [targetId], auto-collect any pickup, and check for treasure.
   * Updates state in place and returns the resulting events (Moved + optional pickup + optional TreasureFound).
   */
  private performMove(targetId: number): GameEvent[] {
    this.state = {
      ...this.state,
      currentRoomId: targetId,
      visitedRoomIds: new Set(this.state.visitedRoomIds).add(targetId),
    }

    const events: GameEvent[] = [{ type: 'Moved', newRoomId: targetId }]

    // Auto-collect pickup.
    //
    // Coins and keys are excluded: both are tapped in the room, so finding one is something
    // the player does rather than something that happens to them. A key is the one pickup
    // that must not be missed, which is why it is worth drawing where the player can see it
    // — and the locked treasure door now says outright that a key is needed.
    //
    // Hints still collect on entry: they are a small bonus with no art of their own.
    const room = this.state.maze.rooms.get(targetId)
    if (
      room !== undefined &&
      room.pickup.type !== 'None' &&
      room.pickup.type !== 'Coin' &&
      room.pickup.type !== 'Key'
    ) {
      const clearedRoom: Room = { ...room, pickup: PICKUP_NONE }
      const updatedRooms = new Map(this.state.maze.rooms).set(targetId, clearedRoom)
      // Kotlin's `when (pickup)` enumerated Coin, Key, Hint and None here, but the guard above
      // has already excluded every case but Hint — Kotlin only needed the other branches to
      // make the `when` exhaustive. TypeScript narrows the type to Hint, so writing the dead
      // branches would not compile. Behaviour is identical; only the unreachable code is gone.
      this.state = {
        ...this.state,
        maze: { ...this.state.maze, rooms: updatedRooms },
        inventory: { ...this.state.inventory, hints: this.state.inventory.hints + 1 },
      }
      events.push({ type: 'PickupCollected', pickup: PICKUP_HINT })
    }

    // First arrival at a windlass chamber: explain the rules once. Without this the room is
    // a dead end containing a winch and no indication that turning it does anything, let
    // alone that there is a second chamber.
    const lock = this.state.maze.treasureLock
    if (
      lock.type === 'Barred' &&
      lock.windlassRoomIds.has(targetId) &&
      !this.windlassExplained
    ) {
      this.windlassExplained = true
      events.push({ type: 'WindlassChamberFound', roomId: targetId })
    }

    // Check for treasure
    if (targetId === this.state.maze.treasureId) {
      this.state = { ...this.state, isComplete: true }
      events.push({ type: 'TreasureFound' })
    }

    return events
  }

  /**
   * Returns the room ID adjacent to [fromRoomId] in [direction], or null if no such room exists.
   *
   * Mazes use a 10-column grid (MazeGenerator guarantees exits never cross row boundaries,
   * so wrap-around is not possible for valid maze exits).
   */
  private findAdjacentRoomId(fromRoomId: number, direction: Direction): number | null {
    const targetId = fromRoomId + directionOffset(direction)
    return this.state.maze.rooms.has(targetId) ? targetId : null
  }

  /**
   * Returns a new Maze with the door in [direction] from the current room set to [newState],
   * **on both sides**.
   *
   * A door between two rooms is stored twice — MazeGenerator writes it into room A under
   * `dir` and into room B under `opposite(dir)`. Updating only the current room desynced the
   * pair: a door opened from one side stayed CLOSED (or LOCKED) when approached from the
   * other, so walking through and turning around re-gated the same door behind a fresh trivia
   * question, and a LOCKED door could charge a second key to come back.
   */
  private setDoorState(direction: Direction, newState: DoorState): Maze {
    const roomId = this.state.currentRoomId
    const currentRoom = this.state.maze.rooms.get(roomId)
    if (currentRoom === undefined) return this.state.maze
    const updatedExit = door(newState)
    const updatedRoom: Room = {
      ...currentRoom,
      exits: new Map(currentRoom.exits).set(direction, updatedExit),
    }
    const rooms = new Map(this.state.maze.rooms).set(roomId, updatedRoom)

    // Mirror onto the neighbour, but only where that neighbour genuinely records the same
    // door. A room off the grid edge, or one whose facing exit is Absent or a Gate, is not
    // the other half of this door and must not be rewritten into one.
    const neighborId = this.findAdjacentRoomId(roomId, direction)
    const neighbor = neighborId !== null ? rooms.get(neighborId) : undefined
    if (neighbor !== undefined && neighbor.exits.get(opposite(direction))?.type === 'Door') {
      const updatedNeighbor: Room = {
        ...neighbor,
        exits: new Map(neighbor.exits).set(opposite(direction), updatedExit),
      }
      rooms.set(neighborId!, updatedNeighbor)
    }

    return { ...this.state.maze, rooms }
  }
}
