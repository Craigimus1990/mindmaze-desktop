import { describe, it, expect } from 'vitest'
import { GameEngine } from '@/engine/engine/GameEngine'
import { TriviaRepository } from '@/engine/engine/TriviaRepository'
import type { Direction } from '@/engine/model/Direction'
import type { GameState } from '@/engine/model/GameState'
import { QUESTIONS_PER_WINDLASS, isRaised } from '@/engine/model/Maze'
import type { ExitType, Room } from '@/engine/model/Room'
import { door, gate, makeRoom } from '@/engine/model/Room'

/**
 * The windlass mechanic: two dead-end rooms, three correct answers each, and the treasure gate
 * rises only when both are done.
 *
 * A wrong answer discards progress on the current windlass, so three *consecutive* correct
 * answers are needed. That is deliberately demanding and confined to HARD.
 */

const stubRepo = (): TriviaRepository =>
  new TriviaRepository(
    `[
      {"id":"q1","topic":"MATH","difficulty":"KINDERGARTEN","question":"2+2?",
       "answers":["3","4","5","6"],"correctIndex":1},
      {"id":"q2","topic":"MATH","difficulty":"KINDERGARTEN","question":"1+1?",
       "answers":["1","2","3","4"],"correctIndex":1},
      {"id":"q3","topic":"MATH","difficulty":"KINDERGARTEN","question":"3+3?",
       "answers":["5","6","7","8"],"correctIndex":1}
    ]`,
    new Set(['MATH']),
    'KINDERGARTEN',
  )

const exits = (...pairs: readonly (readonly [Direction, ExitType])[]) =>
  new Map<Direction, ExitType>(pairs.map(([d, e]) => [d, e]))

/** A two-room maze whose treasure is barred, with the player standing in a windlass room. */
const barredState = ({
  windlassRooms = new Set([1, 2]),
  completed = new Set<number>(),
  progress = new Map<number, number>(),
  currentRoom = 1,
}: {
  windlassRooms?: ReadonlySet<number>
  completed?: ReadonlySet<number>
  progress?: ReadonlyMap<number, number>
  currentRoom?: number
} = {}): GameState => {
  const rooms = new Map<number, Room>([
    [0, makeRoom(0, exits(['EAST', door('OPEN')]))],
    [1, makeRoom(1, exits(['WEST', door('OPEN')]))],
    [2, makeRoom(2, exits(['WEST', door('OPEN')]))],
    [3, makeRoom(3, exits(['WEST', gate('treasure', false)]))],
  ])
  return {
    maze: {
      rooms,
      gatePairs: new Map(),
      startId: 0,
      treasureId: 3,
      treasureLock: { type: 'Barred', windlassRoomIds: windlassRooms, completed },
    },
    currentRoomId: currentRoom,
    visitedRoomIds: new Set([currentRoom]),
    inventory: { keys: 0, hints: 0 },
    coinsCollected: 0,
    treasureBonus: 0,
    windlassProgress: progress,
    correctAnswers: 0,
    elapsedMillis: 0,
    settings: {
      topics: new Set(['MATH']),
      difficulty: 'KINDERGARTEN',
      complexity: 'HARD',
    },
    isComplete: false,
  }
}

describe('windlass', () => {
  it('turning the windlass asks a question', () => {
    const engine = new GameEngine(barredState(), stubRepo())
    const events = engine.turnWindlass()
    expect(
      events.some((e) => e.type === 'TriviaRequired'),
      'turning the windlass should present a question',
    ).toBe(true)
  })

  it('three correct answers raise one windlass', () => {
    const engine = new GameEngine(barredState(), stubRepo())
    for (let i = 0; i < QUESTIONS_PER_WINDLASS; i++) {
      engine.turnWindlass()
      engine.answerWindlass(true)
    }
    const lock = engine.getState().maze.treasureLock
    expect(lock.type).toBe('Barred')
    if (lock.type !== 'Barred') return
    expect(lock.completed.has(1), 'the windlass in room 1 should be raised').toBe(true)
    expect(isRaised(lock), 'one of two windlasses is not enough to open the gate').toBe(false)
  })

  it('every windlass answer reports something', () => {
    // An answer that banked progress but did not finish the windlass returned an EMPTY event
    // list. The reducer folds events over the current state, so no events meant no state
    // change: the trivia dialog stayed open, the player tapped again, and the second tap
    // fell through to the door path and errored with "No pending trivia question".
    const engine = new GameEngine(barredState(), stubRepo())
    engine.turnWindlass()
    const events = engine.answerWindlass(true)
    expect(
      events.length > 0,
      'a correct answer must produce an event or the dialog never closes',
    ).toBe(true)
    expect(
      events.some((e) => e.type === 'WindlassProgressed'),
      'the player should see how far the windlass has come',
    ).toBe(true)
  })

  it('one correct answer does not raise a windlass', () => {
    // Max raised a windlass after a single question. The count was always three; the UI
    // returned him to the room after each answer, so re-tapping the winch read as a fresh
    // start rather than question two of three.
    const engine = new GameEngine(barredState(), stubRepo())
    engine.turnWindlass()
    engine.answerWindlass(true)
    const lock = engine.getState().maze.treasureLock
    expect(lock.type).toBe('Barred')
    if (lock.type !== 'Barred') return
    expect(
      lock.completed.has(1),
      `one answer must not finish a windlass that needs ${QUESTIONS_PER_WINDLASS}`,
    ).toBe(false)
    expect(engine.getState().windlassProgress.get(1), 'one of three banked').toBe(1)
  })

  it('a wrong answer resets progress on that windlass', () => {
    const engine = new GameEngine(barredState(), stubRepo())
    engine.turnWindlass()
    engine.answerWindlass(true)
    engine.turnWindlass()
    engine.answerWindlass(true)
    expect(engine.getState().windlassProgress.get(1), 'two banked before the mistake').toBe(2)

    engine.turnWindlass()
    const events = engine.answerWindlass(false)
    expect(
      engine.getState().windlassProgress.get(1) ?? 0,
      'a wrong answer should send this windlass back to zero',
    ).toBe(0)
    expect(
      events.some((e) => e.type === 'WindlassSlipped'),
      'the player must be told the windlass slipped',
    ).toBe(true)
  })

  it('raising both windlasses opens the treasure gate', () => {
    const engine = new GameEngine(
      barredState({ completed: new Set([2]), progress: new Map([[1, 2]]) }),
      stubRepo(),
    )
    engine.turnWindlass()
    const events = engine.answerWindlass(true)

    const lock = engine.getState().maze.treasureLock
    expect(lock.type).toBe('Barred')
    if (lock.type !== 'Barred') return
    expect(isRaised(lock), 'both windlasses are done; the gate should be raised').toBe(true)
    expect(
      events.some((e) => e.type === 'TreasureGateOpened'),
      'opening the gate is the payoff and must be announced',
    ).toBe(true)
    // The gate must actually be open in the maze, not merely recorded as raised.
    const g = engine.getState().maze.rooms.get(3)!.exits.get('WEST')
    expect(
      g?.type === 'Gate' && g.open,
      'the treasure gate is still shut',
    ).toBe(true)
  })

  it('returning to a finished windlass says so and asks nothing', () => {
    const engine = new GameEngine(barredState({ completed: new Set([1]) }), stubRepo())
    const events = engine.turnWindlass()
    expect(
      events.some((e) => e.type === 'TriviaRequired'),
      'a finished windlass should not ask another question',
    ).toBe(false)
    expect(
      events.some((e) => e.type === 'WindlassAlreadyRaised'),
      'the player should be told this one is already done',
    ).toBe(true)
  })

  it('turning a windlass outside a windlass room does nothing', () => {
    const engine = new GameEngine(barredState({ currentRoom: 0 }), stubRepo())
    const events = engine.turnWindlass()
    expect(
      events.some((e) => e.type === 'InvalidAction'),
      'there is no windlass in room 0',
    ).toBe(true)
  })

  it('a locked treasure door refuses instead of offering trivia', () => {
    // Every other locked door lets a correct answer stand in for the key. Applied to the
    // treasure that would let the player answer one question and walk in, making the hidden
    // key pointless — so the treasure door must refuse outright.
    const rooms = new Map<number, Room>([
      [0, makeRoom(0, exits(['EAST', door('LOCKED')]))],
      [1, makeRoom(1, exits(['WEST', door('LOCKED')]))],
    ])
    const state: GameState = {
      maze: {
        rooms,
        gatePairs: new Map(),
        startId: 0,
        treasureId: 1,
        treasureLock: { type: 'Locked', keyRoomId: 0 },
      },
      currentRoomId: 0,
      visitedRoomIds: new Set([0]),
      inventory: { keys: 0, hints: 0 },
      coinsCollected: 0,
      treasureBonus: 0,
      windlassProgress: new Map(),
      correctAnswers: 0,
      elapsedMillis: 0,
      settings: {
        topics: new Set(['MATH']),
        difficulty: 'KINDERGARTEN',
        complexity: 'MEDIUM',
      },
      isComplete: false,
    }
    const events = new GameEngine(state, stubRepo()).move('EAST')
    expect(
      events.some((e) => e.type === 'TriviaRequired'),
      'the treasure door must not offer a question as a way past the key',
    ).toBe(false)
    expect(
      events.some((e) => e.type === 'TreasureBlocked'),
      'the player should be told they need the key',
    ).toBe(true)
  })

  it('a barred treasure gate explains itself', () => {
    const base = barredState({ currentRoom: 3 })
    const rooms = new Map(base.maze.rooms).set(
      2,
      makeRoom(2, exits(['EAST', gate('treasure', false)])),
    )
    const state: GameState = {
      ...base,
      currentRoomId: 2,
      maze: { ...base.maze, rooms },
    }
    const engine = new GameEngine(state, stubRepo())
    const events = engine.move('EAST')
    expect(
      events.some((e) => e.type === 'TreasureBlocked'),
      'a closed treasure gate should say what raises it',
    ).toBe(true)
  })

  it('progress survives leaving and re-entering the room', () => {
    // windlassProgress lives on GameState, which is what gets persisted, so a child who
    // wanders off mid-puzzle does not silently lose two correct answers.
    const engine = new GameEngine(barredState({ progress: new Map([[1, 2]]) }), stubRepo())
    expect(engine.getState().windlassProgress.get(1)).toBe(2)
    engine.turnWindlass()
    engine.answerWindlass(true)
    const lock = engine.getState().maze.treasureLock
    expect(lock.type).toBe('Barred')
    if (lock.type !== 'Barred') return
    expect(
      lock.completed.has(1),
      'the third answer should finish a windlass resumed at two',
    ).toBe(true)
  })
})
