import { describe, it, expect } from 'vitest'
import { GameEngine } from '@/engine/engine/GameEngine'
import { COIN_POINTS, computeScore } from '@/engine/engine/ScoreCalculator'
import { TriviaRepository } from '@/engine/engine/TriviaRepository'
import type { Direction } from '@/engine/model/Direction'
import type { GameState } from '@/engine/model/GameState'
import { TREASURE_OPEN } from '@/engine/model/Maze'
import type { ExitType, Room } from '@/engine/model/Room'
import { PICKUP_COIN, door, gate, makeRoom } from '@/engine/model/Room'
import type { Inventory } from '@/engine/model/types'

/**
 * Tests for GameEngine state machine.
 *
 * Room IDs follow the MazeGenerator/MazeSolver grid convention: a 10-column
 * grid where EAST = +1, WEST = -1, SOUTH = +10, NORTH = -10.
 *
 * Test layout: room 0 is startId, adjacent rooms are room 1 (EAST) and room 10 (SOUTH).
 * treasureId is always 99 unless a test needs it to be reachable.
 */

// A minimal JSON array that TriviaRepository can parse.
const STUB_QUESTIONS_JSON =
  '[{"id":"q1","topic":"MATH","difficulty":"KINDERGARTEN","question":"1+1?","answers":["1","2","3","4"],"correctIndex":1}]'

const stubRepo = (): TriviaRepository =>
  new TriviaRepository(STUB_QUESTIONS_JSON, new Set(['MATH']), 'KINDERGARTEN')

const exits = (...pairs: readonly (readonly [Direction, ExitType])[]) =>
  new Map<Direction, ExitType>(pairs.map(([d, e]) => [d, e]))

/**
 * Build a minimal GameState from a hand-crafted rooms map.
 * startId defaults to 0; the maze grid is 10-columns wide so:
 *   - room 0 EAST  → room 1
 *   - room 0 SOUTH → room 10
 */
const simpleState = (
  rooms: ReadonlyMap<number, Room>,
  {
    startId = 0,
    treasureId = 99,
    inventory = { keys: 0, hints: 0 } as Inventory,
    coinsCollected = 0,
  }: {
    startId?: number
    treasureId?: number
    inventory?: Inventory
    coinsCollected?: number
  } = {},
): GameState => ({
  maze: {
    rooms,
    gatePairs: new Map(),
    startId,
    treasureId,
    treasureLock: TREASURE_OPEN,
  },
  currentRoomId: startId,
  visitedRoomIds: new Set([startId]),
  inventory,
  coinsCollected,
  treasureBonus: 0,
  windlassProgress: new Map(),
  correctAnswers: 0,
  elapsedMillis: 0,
  settings: {
    topics: new Set(['MATH']),
    difficulty: 'KINDERGARTEN',
    complexity: 'SIMPLE',
  },
  isComplete: false,
})

const roomsOf = (...rs: readonly Room[]): ReadonlyMap<number, Room> =>
  new Map(rs.map((r) => [r.id, r]))

describe('GameEngine', () => {
  it('move into absent exit returns InvalidAction', () => {
    const state = simpleState(roomsOf(makeRoom(0, new Map())))
    const engine = new GameEngine(state, stubRepo())
    const events = engine.move('EAST')
    expect(events.length).toBe(1)
    expect(events[0]!.type).toBe('InvalidAction')
  })

  it('move through open door moves player', () => {
    const state = simpleState(
      roomsOf(makeRoom(0, exits(['EAST', door('OPEN')])), makeRoom(1)),
    )
    const engine = new GameEngine(state, stubRepo())
    const events = engine.move('EAST')
    expect(events.some((e) => e.type === 'Moved' && e.newRoomId === 1)).toBe(true)
    expect(engine.getState().currentRoomId).toBe(1)
  })

  it('move through closed door returns TriviaRequired', () => {
    const state = simpleState(
      roomsOf(makeRoom(0, exits(['EAST', door('CLOSED')])), makeRoom(1)),
    )
    const engine = new GameEngine(state, stubRepo())
    const events = engine.move('EAST')
    expect(events.length).toBe(1)
    expect(events[0]!.type).toBe('TriviaRequired')
    expect(engine.getState().currentRoomId, 'Player should not have moved').toBe(0)
  })

  it('wrong answer returns WrongAnswer', () => {
    const state = simpleState(
      roomsOf(makeRoom(0, exits(['EAST', door('CLOSED')])), makeRoom(1)),
    )
    const engine = new GameEngine(state, stubRepo())
    engine.move('EAST') // triggers TriviaRequired
    const events = engine.submitAnswer(0, 1) // wrong
    expect(events.length).toBe(1)
    expect(events[0]!.type).toBe('WrongAnswer')
    expect(engine.getState().currentRoomId, 'Player should still be at room 0').toBe(0)
  })

  it('correct answer opens door and moves player', () => {
    const state = simpleState(
      roomsOf(makeRoom(0, exits(['EAST', door('CLOSED')])), makeRoom(1)),
    )
    const engine = new GameEngine(state, stubRepo())
    engine.move('EAST') // triggers TriviaRequired
    const events = engine.submitAnswer(1, 1) // correct
    expect(events.some((e) => e.type === 'DoorOpened')).toBe(true)
    expect(events.some((e) => e.type === 'Moved' && e.newRoomId === 1)).toBe(true)
    expect(engine.getState().currentRoomId).toBe(1)
    expect(engine.getState().correctAnswers).toBe(1)
  })

  it('locked door with key unlocks and moves player', () => {
    const state = simpleState(
      roomsOf(makeRoom(0, exits(['EAST', door('LOCKED')])), makeRoom(1)),
      { inventory: { keys: 1, hints: 0 } },
    )
    const engine = new GameEngine(state, stubRepo())
    const events = engine.move('EAST')
    expect(events.some((e) => e.type === 'DoorUnlocked')).toBe(true)
    expect(events.some((e) => e.type === 'Moved' && e.newRoomId === 1)).toBe(true)
    expect(engine.getState().inventory.keys, 'Key should have been consumed').toBe(0)
  })

  it('locked door without key triggers trivia', () => {
    const state = simpleState(
      roomsOf(makeRoom(0, exits(['EAST', door('LOCKED')])), makeRoom(1)),
      { inventory: { keys: 0, hints: 0 } },
    )
    const engine = new GameEngine(state, stubRepo())
    const events = engine.move('EAST')
    expect(events.length).toBe(1)
    expect(events[0]!.type).toBe('TriviaRequired')
  })

  // Coins became a tappable object drawn in the room, so that finding one is something the
  // player does rather than something that happens on the way past. Keys and hints still
  // auto-collect: they gate progress, and walking past one leaves a child stuck with no
  // explanation.
  it('coin is not auto-collected on move', () => {
    const state = simpleState(
      roomsOf(
        makeRoom(0, exits(['EAST', door('OPEN')])),
        makeRoom(1, new Map(), PICKUP_COIN),
      ),
    )
    const engine = new GameEngine(state, stubRepo())
    const events = engine.move('EAST')
    expect(
      events.some((e) => e.type === 'PickupCollected'),
      'Coins must wait to be tapped',
    ).toBe(false)
    expect(engine.getState().coinsCollected).toBe(0)
    expect(
      engine.getState().maze.rooms.get(1)!.pickup.type,
      'the coin should still be sitting in the room',
    ).toBe('Coin')
  })

  it('tapping a coin collects it', () => {
    const state = simpleState(
      roomsOf(
        makeRoom(0, exits(['EAST', door('OPEN')])),
        makeRoom(1, new Map(), PICKUP_COIN),
      ),
    )
    const engine = new GameEngine(state, stubRepo())
    engine.move('EAST')
    const events = engine.collectCoin(COIN_POINTS)
    expect(
      events.some((e) => e.type === 'PickupCollected' && e.pickup.type === 'Coin'),
    ).toBe(true)
    expect(engine.getState().coinsCollected).toBe(1)
    expect(engine.getState().treasureBonus, 'a plain coin adds no bonus').toBe(0)
    expect(engine.getState().maze.rooms.get(1)!.pickup.type).toBe('None')
  })

  it('a jewel scores its extra value as a bonus', () => {
    // ScoreCalculator multiplies the coin COUNT by COIN_POINTS, so a jewel's extra value has
    // to live outside that field or it would be multiplied a second time.
    const state = simpleState(
      roomsOf(
        makeRoom(0, exits(['EAST', door('OPEN')])),
        makeRoom(1, new Map(), PICKUP_COIN),
      ),
    )
    const engine = new GameEngine(state, stubRepo())
    engine.move('EAST')
    engine.collectCoin(400)
    expect(engine.getState().coinsCollected).toBe(1)
    expect(engine.getState().treasureBonus).toBe(400 - COIN_POINTS)
    const score = computeScore(
      engine.getState().coinsCollected,
      0,
      0,
      engine.getState().treasureBonus,
    )
    expect(score.coinPoints + score.treasureBonus, 'a jewel should be worth 400').toBe(400)
  })

  it('collecting the same coin twice scores once', () => {
    // A child taps a shiny thing more than once; the second tap must do nothing.
    const state = simpleState(
      roomsOf(
        makeRoom(0, exits(['EAST', door('OPEN')])),
        makeRoom(1, new Map(), PICKUP_COIN),
      ),
    )
    const engine = new GameEngine(state, stubRepo())
    engine.move('EAST')
    engine.collectCoin(COIN_POINTS)
    const second = engine.collectCoin(COIN_POINTS)
    expect(engine.getState().coinsCollected, 'a second tap must not score again').toBe(1)
    expect(second.some((e) => e.type === 'InvalidAction')).toBe(true)
  })

  it('treasure room triggers TreasureFound', () => {
    const state = simpleState(
      roomsOf(makeRoom(0, exits(['EAST', door('OPEN')])), makeRoom(1)),
      { startId: 0, treasureId: 1 },
    )
    const engine = new GameEngine(state, stubRepo())
    const events = engine.move('EAST')
    expect(events.some((e) => e.type === 'TreasureFound')).toBe(true)
    expect(engine.getState().isComplete).toBe(true)
  })

  it('pressButton with no button returns InvalidAction', () => {
    const state = simpleState(roomsOf(makeRoom(0, new Map(), undefined, null)))
    const engine = new GameEngine(state, stubRepo())
    const events = engine.pressButton()
    expect(events.length).toBe(1)
    expect(events[0]!.type).toBe('InvalidAction')
  })

  it('useHint with no hints returns InvalidAction', () => {
    const state = simpleState(roomsOf(makeRoom(0)), {
      inventory: { keys: 0, hints: 0 },
    })
    const engine = new GameEngine(state, stubRepo())
    const events = engine.useHint()
    expect(events.length).toBe(1)
    expect(events[0]!.type).toBe('InvalidAction')
  })

  // --- door state is shared between the two rooms it joins ---------------------------------

  /**
   * A door is stored twice, once in each room it joins. Opening it must update both, or the
   * player walks through and finds the same door closed behind them — re-gated by a fresh
   * trivia question they already answered.
   */
  it('answering correctly opens the door on both sides', () => {
    const state = simpleState(
      roomsOf(
        makeRoom(0, exits(['EAST', door('CLOSED')])),
        makeRoom(1, exits(['WEST', door('CLOSED')])),
      ),
    )
    const engine = new GameEngine(state, stubRepo())

    engine.move('EAST')
    engine.submitAnswer(1, 1)

    const maze = engine.getState().maze
    expect(maze.rooms.get(0)?.exits.get('EAST')).toEqual(door('OPEN'))
    expect(
      maze.rooms.get(1)?.exits.get('WEST'),
      'far side of the door must open too',
    ).toEqual(door('OPEN'))
  })

  /** The same, via the key path — where a desync would charge a second key to walk back. */
  it('unlocking with a key opens the door on both sides', () => {
    const state = simpleState(
      roomsOf(
        makeRoom(0, exits(['EAST', door('LOCKED')])),
        makeRoom(1, exits(['WEST', door('LOCKED')])),
      ),
      { inventory: { keys: 1, hints: 0 } },
    )
    const engine = new GameEngine(state, stubRepo())

    engine.move('EAST')

    const maze = engine.getState().maze
    expect(maze.rooms.get(0)?.exits.get('EAST')).toEqual(door('OPEN'))
    expect(
      maze.rooms.get(1)?.exits.get('WEST'),
      'far side of the door must open too',
    ).toEqual(door('OPEN'))
    expect(engine.getState().inventory.keys).toBe(0)
  })

  /** Having opened a door, going back through it must not re-trigger trivia. */
  it('walking back through an opened door does not ask again', () => {
    const state = simpleState(
      roomsOf(
        makeRoom(0, exits(['EAST', door('CLOSED')])),
        makeRoom(1, exits(['WEST', door('CLOSED')])),
      ),
    )
    const engine = new GameEngine(state, stubRepo())

    engine.move('EAST')
    engine.submitAnswer(1, 1)
    expect(engine.getState().currentRoomId).toBe(1)

    const back = engine.move('WEST')

    expect(
      back.some((e) => e.type === 'TriviaRequired'),
      'going back through an already-open door must not re-ask',
    ).toBe(false)
    expect(engine.getState().currentRoomId).toBe(0)
  })

  /** A Gate on the far side is a different exit type, not the other half of this door, and
   *  must not be overwritten into one. */
  it('opening a door does not overwrite a neighbouring gate', () => {
    const state = simpleState(
      roomsOf(
        makeRoom(0, exits(['EAST', door('CLOSED')])),
        makeRoom(1, exits(['WEST', gate('g1', false)])),
      ),
    )
    const engine = new GameEngine(state, stubRepo())

    engine.move('EAST')
    engine.submitAnswer(1, 1)

    expect(
      engine.getState().maze.rooms.get(1)?.exits.get('WEST'),
      'a gate is not the far side of a door and must be left alone',
    ).toEqual(gate('g1', false))
  })
})
