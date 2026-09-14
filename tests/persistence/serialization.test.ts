import { describe, it, expect } from 'vitest'
import {
  deserializeGameState,
  serializeGameState,
} from '@/persistence/serialization'
import { GameEngine } from '@/engine/engine/GameEngine'
import { generate } from '@/engine/engine/MazeGenerator'
import { TriviaRepository } from '@/engine/engine/TriviaRepository'
import { makeRng } from '@/engine/engine/rng'
import type { Direction } from '@/engine/model/Direction'
import type { GameState } from '@/engine/model/GameState'
import type { ExitType, Room } from '@/engine/model/Room'
import { ABSENT, PICKUP_COIN, PICKUP_KEY, door, gate, makeRoom } from '@/engine/model/Room'

/**
 * The save format, ported from Kotlin's GameStateSerializationTest.
 *
 * Kotlin's kotlinx.serialization handled Map and Set for free, so its test was a single
 * round-trip. JSON.stringify does not: a Map or a Set becomes `{}` and every entry is lost
 * silently. So these tests check each collection in the tree individually, because "it
 * round-trips" was exactly the assertion that would have passed while the maze arrived empty.
 *
 * This pins THIS app's save format. It deliberately does not assert agreement with Kotlin's
 * output — save-file compatibility with the Android build is a non-goal.
 */

const exits = (...pairs: readonly (readonly [Direction, ExitType])[]) =>
  new Map<Direction, ExitType>(pairs.map(([d, e]) => [d, e]))

const sampleState = (): GameState => ({
  maze: {
    rooms: new Map<number, Room>([
      [
        0,
        makeRoom(
          0,
          exits(['NORTH', door('OPEN')], ['EAST', gate('g1', true)]),
          PICKUP_COIN,
          null,
        ),
      ],
      [10, makeRoom(10, exits(['SOUTH', ABSENT]), PICKUP_KEY, 'g1')],
    ]),
    gatePairs: new Map([
      ['g1', { id: 'g1', openRoomId: 0, openDirection: 'EAST' as Direction }],
    ]),
    startId: 0,
    treasureId: 10,
    treasureLock: { type: 'Open' },
  },
  currentRoomId: 0,
  visitedRoomIds: new Set([0]),
  inventory: { keys: 1, hints: 2 },
  coinsCollected: 3,
  treasureBonus: 250,
  windlassProgress: new Map(),
  correctAnswers: 5,
  elapsedMillis: 12345,
  settings: {
    topics: new Set(['MATH', 'HISTORY']),
    difficulty: 'KINDERGARTEN',
    complexity: 'MEDIUM',
  },
  isComplete: false,
})

const roundTrip = (s: GameState): GameState =>
  deserializeGameState(serializeGameState(s))

describe('GameState serialization', () => {
  it('GameState round-trips through JSON', () => {
    const original = sampleState()
    expect(roundTrip(original)).toEqual(original)
  })

  it('the rooms map survives, with its rooms', () => {
    // JSON.stringify(new Map()) is "{}". The whole maze arriving empty is the failure this
    // catches, and it produces a game with no walls rather than a crash.
    const decoded = roundTrip(sampleState())
    expect(decoded.maze.rooms).toBeInstanceOf(Map)
    expect(decoded.maze.rooms.size).toBe(2)
    expect(decoded.maze.rooms.get(0)?.id).toBe(0)
    expect(decoded.maze.rooms.get(10)?.buttonGatePairId).toBe('g1')
  })

  it('each room keeps its exits, by direction and type', () => {
    const decoded = roundTrip(sampleState())
    const room0 = decoded.maze.rooms.get(0)!
    expect(room0.exits).toBeInstanceOf(Map)
    expect(room0.exits.get('NORTH')).toEqual(door('OPEN'))
    expect(room0.exits.get('EAST')).toEqual(gate('g1', true))
    expect(decoded.maze.rooms.get(10)!.exits.get('SOUTH')).toEqual(ABSENT)
  })

  it('pickups survive', () => {
    const decoded = roundTrip(sampleState())
    expect(decoded.maze.rooms.get(0)!.pickup).toEqual(PICKUP_COIN)
    expect(decoded.maze.rooms.get(10)!.pickup).toEqual(PICKUP_KEY)
  })

  it('gatePairs survives', () => {
    const decoded = roundTrip(sampleState())
    expect(decoded.maze.gatePairs).toBeInstanceOf(Map)
    expect(decoded.maze.gatePairs.get('g1')).toEqual({
      id: 'g1',
      openRoomId: 0,
      openDirection: 'EAST',
    })
  })

  it('visitedRoomIds survives as a Set', () => {
    const base = sampleState()
    const decoded = roundTrip({ ...base, visitedRoomIds: new Set([0, 1, 10]) })
    expect(decoded.visitedRoomIds).toBeInstanceOf(Set)
    expect([...decoded.visitedRoomIds].sort((a, b) => a - b)).toEqual([0, 1, 10])
  })

  it('settings.topics survives as a Set', () => {
    const decoded = roundTrip(sampleState())
    expect(decoded.settings.topics).toBeInstanceOf(Set)
    expect([...decoded.settings.topics].sort()).toEqual(['HISTORY', 'MATH'])
  })

  it('a Locked treasure lock keeps its key room', () => {
    const base = sampleState()
    const decoded = roundTrip({
      ...base,
      maze: { ...base.maze, treasureLock: { type: 'Locked', keyRoomId: 42 } },
    })
    expect(decoded.maze.treasureLock).toEqual({ type: 'Locked', keyRoomId: 42 })
  })

  it("a Barred treasure lock keeps both of its sets", () => {
    // Two Sets nested inside a union member — the easiest pair to miss, and losing `completed`
    // would silently un-raise a windlass the player had already finished.
    const base = sampleState()
    const decoded = roundTrip({
      ...base,
      maze: {
        ...base.maze,
        treasureLock: {
          type: 'Barred',
          windlassRoomIds: new Set([4, 9]),
          completed: new Set([4]),
        },
      },
    })
    const lock = decoded.maze.treasureLock
    expect(lock.type).toBe('Barred')
    if (lock.type !== 'Barred') return
    expect(lock.windlassRoomIds).toBeInstanceOf(Set)
    expect([...lock.windlassRoomIds].sort((a, b) => a - b)).toEqual([4, 9])
    expect(lock.completed).toBeInstanceOf(Set)
    expect([...lock.completed]).toEqual([4])
  })

  it('windlassProgress survives as a Map', () => {
    // This is the whole reason progress lives on GameState rather than on the Room: a child who
    // wanders off mid-puzzle must not lose two banked answers to a save/reload.
    const base = sampleState()
    const decoded = roundTrip({
      ...base,
      windlassProgress: new Map([
        [4, 2],
        [9, 1],
      ]),
    })
    expect(decoded.windlassProgress).toBeInstanceOf(Map)
    expect(decoded.windlassProgress.get(4)).toBe(2)
    expect(decoded.windlassProgress.get(9)).toBe(1)
  })

  it('a generated maze round-trips unchanged', () => {
    // Hand-built fixtures only cover the shapes someone thought to write down. A real generated
    // HARD maze has every exit type, a Barred lock and scattered pickups.
    const base = sampleState()
    for (const seed of [0, 1, 2]) {
      const maze = generate('HARD', makeRng(seed))
      const state: GameState = { ...base, maze, currentRoomId: maze.startId }
      expect(roundTrip(state)).toEqual(state)
    }
  })

  it('a reloaded state drives the engine identically', () => {
    // The point of the format is that play continues, not that a deep-equal passes.
    const maze = generate('SIMPLE', makeRng(7))
    const base = sampleState()
    const state: GameState = {
      ...base,
      maze,
      currentRoomId: maze.startId,
      visitedRoomIds: new Set([maze.startId]),
    }
    const repo = () =>
      new TriviaRepository(
        '[{"id":"q1","topic":"MATH","difficulty":"KINDERGARTEN","question":"1+1?","answers":["1","2"],"correctIndex":1}]',
        new Set(['MATH']),
        'KINDERGARTEN',
      )

    const before = new GameEngine(state, repo())
    const after = new GameEngine(roundTrip(state), repo())
    for (const dir of ['NORTH', 'SOUTH', 'EAST', 'WEST'] as const) {
      expect(after.move(dir).map((e) => e.type)).toEqual(
        before.move(dir).map((e) => e.type),
      )
    }
  })

  it('a corrupt save is rejected rather than half-loaded', () => {
    expect(() => deserializeGameState('{"version":1}')).toThrow(/corrupt save/)
    expect(() => deserializeGameState('[]')).toThrow(/corrupt save/)
    expect(() => deserializeGameState('{"version":99}')).toThrow(/version/)
  })

  // --- closed-string fields are validated, not just shaped ---------------------------------
  //
  // A string that is really an enum type-checks under `as Topic` and validates nothing: the
  // union is erased at runtime. Each of these five was accepted silently before, producing a
  // GameState that was type-correct and semantically wrong. The DoorState case was the most
  // concrete — a Door with a bogus `state` falls through move()'s switch into the Gate
  // remainder and returns InvalidAction('Gate is closed'), a door reporting itself as a gate.
  //
  // Inputs are built by serializing a REAL generated maze and mutating one field. A hand-written
  // fixture is easy to get structurally wrong, which would throw for the wrong reason and mask
  // what is under test — so each case asserts the message names its own field.

  /** Serialize a real generated maze, mutate the parsed tree, and re-encode. */
  const mutatedSave = (mutate: (save: Record<string, any>) => void): string => {
    const maze = generate('SIMPLE', makeRng(3))
    const state: GameState = {
      ...sampleState(),
      maze,
      currentRoomId: maze.startId,
      visitedRoomIds: new Set([maze.startId]),
    }
    const save = JSON.parse(serializeGameState(state))
    mutate(save)
    return JSON.stringify(save)
  }

  it('the unmutated control save still loads', () => {
    // Guards the mutation harness itself: if this threw, every rejection test below would pass
    // for the wrong reason.
    expect(() => deserializeGameState(mutatedSave(() => {}))).not.toThrow()
  })

  it('rejects a bogus DoorState', () => {
    const json = mutatedSave((save) => {
      for (const [, room] of save.maze.rooms) {
        const doorExit = room.exits.find(
          ([, e]: [string, { type: string }]) => e.type === 'Door',
        )
        if (doorExit) {
          doorExit[1].state = 'BANANA'
          return
        }
      }
      throw new Error('fixture has no Door to mutate')
    })
    expect(() => deserializeGameState(json)).toThrow(/corrupt save: door state/)
    expect(() => deserializeGameState(json)).toThrow(/BANANA/)
  })

  it('rejects a bogus Direction as an exit key', () => {
    const json = mutatedSave((save) => {
      const firstRoom = save.maze.rooms[0][1]
      firstRoom.exits[0][0] = 'UPWARDS'
    })
    expect(() => deserializeGameState(json)).toThrow(/corrupt save: exit direction/)
    expect(() => deserializeGameState(json)).toThrow(/UPWARDS/)
  })

  it('rejects a bogus Direction in a gate pair', () => {
    const json = mutatedSave((save) => {
      // The generated SIMPLE maze may have no gate pairs; add one so the field exists.
      save.maze.gatePairs = [['g1', { id: 'g1', openRoomId: 0, openDirection: 'SIDEWAYS' }]]
    })
    expect(() => deserializeGameState(json)).toThrow(
      /corrupt save: gatePair.openDirection/,
    )
    expect(() => deserializeGameState(json)).toThrow(/SIDEWAYS/)
  })

  it('rejects a bogus Topic', () => {
    const json = mutatedSave((save) => {
      save.settings.topics = ['ASTROLOGY']
    })
    expect(() => deserializeGameState(json)).toThrow(/corrupt save: settings.topics entry/)
    expect(() => deserializeGameState(json)).toThrow(/ASTROLOGY/)
  })

  it('rejects a bogus Difficulty', () => {
    const json = mutatedSave((save) => {
      save.settings.difficulty = 'NONSENSE'
    })
    expect(() => deserializeGameState(json)).toThrow(/corrupt save: settings.difficulty/)
    expect(() => deserializeGameState(json)).toThrow(/NONSENSE/)
  })

  it('rejects a bogus Complexity', () => {
    const json = mutatedSave((save) => {
      save.settings.complexity = 'IMPOSSIBLE'
    })
    expect(() => deserializeGameState(json)).toThrow(/corrupt save: settings.complexity/)
    expect(() => deserializeGameState(json)).toThrow(/IMPOSSIBLE/)
  })

  // The three union discriminants were ALREADY rejected, by the `default:` branch of each
  // decode switch — no oneOf check was added for them. Pinned so that stays true.
  it('rejects bogus union discriminants', () => {
    expect(() =>
      deserializeGameState(
        mutatedSave((save) => {
          save.maze.rooms[0][1].exits[0][1] = { type: 'Portal' }
        }),
      ),
    ).toThrow(/unknown exit type/)

    expect(() =>
      deserializeGameState(
        mutatedSave((save) => {
          save.maze.rooms[0][1].pickup = { type: 'Sandwich' }
        }),
      ),
    ).toThrow(/unknown pickup type/)

    expect(() =>
      deserializeGameState(
        mutatedSave((save) => {
          save.maze.treasureLock = { type: 'Welded' }
        }),
      ),
    ).toThrow(/unknown treasureLock type/)
  })

  it('validation does not reject good saves', () => {
    // The control for all of the above: a HARD maze exercises every collection type at once —
    // 85 rooms, a Barred lock with two Sets, gate pairs, and all three exit types.
    for (const seed of [0, 1, 2, 3, 4]) {
      const maze = generate('HARD', makeRng(seed))
      expect(maze.treasureLock.type).toBe('Barred')
      const state: GameState = {
        ...sampleState(),
        maze,
        currentRoomId: maze.startId,
        visitedRoomIds: new Set([maze.startId]),
        windlassProgress: new Map([[4, 2]]),
      }
      expect(roundTrip(state)).toEqual(state)
    }
  })
})
