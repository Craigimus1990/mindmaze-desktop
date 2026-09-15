import { describe, expect, it } from 'vitest'
import type { GameEngine } from '@/engine/engine/GameEngine'
import type { GameEvent } from '@/engine/engine/GameEvent'
import type { GameState } from '@/engine/model/GameState'
import type { UiState } from '@/ui/UiState'
import {
  isConfirmedMove,
  movedDirectionFor,
  runAction,
  withEntryDirection,
  type ActionContext,
} from '@/react/useGame'

/**
 * Covers the reducer-facing logic `useGame` extracts from the hook body.
 *
 * The React plumbing (refs, the ticker, persistence) is deliberately not exercised here — Task 14
 * defers screen testing, matching the Android project's own deferral of Compose UI tests. What IS
 * tested is everything with real branching: the confirmed-move gate, the windlass question chain,
 * the self-reporting no-ops, and the entryDirection stamp. Those are the behaviours nothing else
 * would catch if they broke.
 */

/** Records every engine call and replays a scripted response, so no maze is needed. */
class FakeEngine {
  readonly calls: string[] = []
  private readonly script: Map<string, GameEvent[][]> = new Map()

  /** Queues the events a named call returns, in order; the last entry repeats. */
  script_(name: string, ...responses: GameEvent[][]): this {
    this.script.set(name, responses)
    return this
  }

  private next(name: string, arg?: unknown): GameEvent[] {
    this.calls.push(arg === undefined ? name : `${name}(${String(arg)})`)
    const queued = this.script.get(name)
    if (queued === undefined || queued.length === 0) return []
    return queued.length === 1 ? queued[0]! : queued.shift()!
  }

  move(d: string): GameEvent[] { return this.next('move', d) }
  submitAnswer(i: number, c: number): GameEvent[] { return this.next('submitAnswer', `${i},${c}`) }
  answerWindlass(correct: boolean): GameEvent[] { return this.next('answerWindlass', correct) }
  turnWindlass(): GameEvent[] { return this.next('turnWindlass') }
  pressButton(): GameEvent[] { return this.next('pressButton') }
  useHint(): GameEvent[] { return this.next('useHint') }
  collectCoin(p: number): GameEvent[] { return this.next('collectCoin', p) }
}

const asEngine = (f: FakeEngine): GameEngine => f as unknown as GameEngine

const GAME = {} as GameState

const trivia = (direction: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST', correctIndex: number): UiState => ({
  type: 'Trivia',
  game: GAME,
  question: {
    id: 'q', topic: 'MATH', difficulty: 'KINDERGARTEN',
    question: 'q?', answers: ['a', 'b', 'c', 'd'], correctIndex,
  },
  direction,
  answers: ['a', 'b', 'c', 'd'],
  correctIndex,
})

const inGame: UiState = { type: 'InGame', game: GAME }

const ctx = (engine: FakeEngine, over: Partial<ActionContext> = {}): ActionContext => ({
  engine: asEngine(engine),
  before: inGame,
  entryDirection: null,
  windlassPending: false,
  ...over,
})

describe('movedDirectionFor', () => {
  it('takes the direction from Move and AttemptDoor', () => {
    expect(movedDirectionFor({ type: 'Move', direction: 'EAST' }, inGame, null)).toBe('EAST')
    expect(movedDirectionFor({ type: 'AttemptDoor', direction: 'WEST' }, inGame, null)).toBe('WEST')
  })

  it('retraces the entry direction for MoveBack', () => {
    expect(movedDirectionFor({ type: 'MoveBack' }, inGame, 'SOUTH')).toBe('SOUTH')
    expect(movedDirectionFor({ type: 'MoveBack' }, inGame, null)).toBeNull()
  })

  it('takes the pending question direction for SubmitAnswer', () => {
    expect(movedDirectionFor({ type: 'SubmitAnswer', index: 0 }, trivia('NORTH', 0), null))
      .toBe('NORTH')
  })

  it('is null for an answer with no question on screen', () => {
    expect(movedDirectionFor({ type: 'SubmitAnswer', index: 0 }, inGame, 'EAST')).toBeNull()
  })

  it('is null for actions that do not move the player', () => {
    for (const a of [
      { type: 'UseHint' }, { type: 'UseKey' }, { type: 'TurnWindlass' },
      { type: 'PressButton' }, { type: 'CollectPickup' },
      { type: 'CollectTreasure', points: 100 },
    ] as const) {
      expect(movedDirectionFor(a, inGame, 'EAST'), a.type).toBeNull()
    }
  })
})

describe('isConfirmedMove', () => {
  it('accepts Moved and TreasureFound', () => {
    expect(isConfirmedMove([{ type: 'Moved', newRoomId: 1 }])).toBe(true)
    expect(isConfirmedMove([{ type: 'TreasureFound' }])).toBe(true)
  })

  it('rejects a deferred or refused move, which is the whole point of the gate', () => {
    // TriviaRequired means the player is standing still in front of a question; InvalidAction
    // means the engine said no. Re-framing the room on either would turn the view without the
    // player having moved.
    expect(isConfirmedMove([{
      type: 'TriviaRequired',
      direction: 'NORTH',
      question: {
        id: 'q', topic: 'MATH', difficulty: 'KINDERGARTEN',
        question: 'q?', answers: ['a', 'b', 'c', 'd'], correctIndex: 0,
      },
    }])).toBe(false)
    expect(isConfirmedMove([{ type: 'InvalidAction', reason: 'nope' }])).toBe(false)
    expect(isConfirmedMove([])).toBe(false)
  })
})

describe('runAction', () => {
  it('routes Move and AttemptDoor to engine.move', () => {
    const e = new FakeEngine()
    runAction({ type: 'Move', direction: 'NORTH' }, ctx(e))
    runAction({ type: 'AttemptDoor', direction: 'SOUTH' }, ctx(e))
    expect(e.calls).toEqual(['move(NORTH)', 'move(SOUTH)'])
  })

  it('walks MoveBack in the entry direction', () => {
    const e = new FakeEngine()
    const r = runAction({ type: 'MoveBack' }, ctx(e, { entryDirection: 'WEST' }))
    expect(e.calls).toEqual(['move(WEST)'])
    expect(r.ran).toBe(true)
  })

  it('does not run MoveBack in the start room', () => {
    const e = new FakeEngine()
    const r = runAction({ type: 'MoveBack' }, ctx(e, { entryDirection: null }))
    expect(e.calls).toEqual([])
    expect(r.ran).toBe(false)
  })

  it('does not run SubmitAnswer with no question on screen', () => {
    const e = new FakeEngine()
    const r = runAction({ type: 'SubmitAnswer', index: 1 }, ctx(e))
    expect(e.calls).toEqual([])
    expect(r.ran).toBe(false)
  })

  it('grades a door answer through submitAnswer, passing the DISPLAYED correct index', () => {
    // After a hint the displayed list is narrowed and correctIndex remapped into it, so the
    // index handed to the engine must come from the UiState, not the original question.
    const e = new FakeEngine()
    runAction({ type: 'SubmitAnswer', index: 1 }, ctx(e, { before: trivia('NORTH', 2) }))
    expect(e.calls).toEqual(['submitAnswer(1,2)'])
  })

  describe('the windlass question chain', () => {
    it('routes a windlass answer to answerWindlass, not submitAnswer', () => {
      // A wrong door answer just keeps the door shut; a wrong windlass answer discards banked
      // progress, so the two must not share a path.
      const e = new FakeEngine()
      runAction(
        { type: 'SubmitAnswer', index: 3 },
        ctx(e, { before: trivia('NORTH', 2), windlassPending: true }),
      )
      expect(e.calls).toEqual(['answerWindlass(false)'])
    })

    it('reports a correct windlass answer as correct', () => {
      const e = new FakeEngine()
      runAction(
        { type: 'SubmitAnswer', index: 2 },
        ctx(e, { before: trivia('NORTH', 2), windlassPending: true }),
      )
      expect(e.calls).toEqual(['answerWindlass(true)'])
    })

    it('asks the next question immediately when progress is banked', () => {
      // Making the player re-tap the winch between questions read as "one question and done",
      // which is how a windlass got raised after a single answer.
      const e = new FakeEngine()
        .script_('answerWindlass', [{ type: 'WindlassProgressed', roomId: 4, banked: 1, needed: 3 }])
        .script_('turnWindlass', [{
          type: 'TriviaRequired',
          direction: 'NORTH',
          question: {
            id: 'q2', topic: 'MATH', difficulty: 'KINDERGARTEN',
            question: 'next?', answers: ['a', 'b', 'c', 'd'], correctIndex: 1,
          },
        }])
      const r = runAction(
        { type: 'SubmitAnswer', index: 2 },
        ctx(e, { before: trivia('NORTH', 2), windlassPending: true }),
      )
      expect(e.calls).toEqual(['answerWindlass(true)', 'turnWindlass'])
      expect(r.events.map((x) => x.type)).toEqual(['WindlassProgressed', 'TriviaRequired'])
      expect(r.windlassPending).toBe(true)
    })

    it('filters WindlassChamberFound out of the follow-up question', () => {
      // The chamber introduction is a modal; firing it again between every question would bury
      // the question behind a dialog the player already read.
      const e = new FakeEngine()
        .script_('answerWindlass', [{ type: 'WindlassProgressed', roomId: 4, banked: 2, needed: 3 }])
        .script_('turnWindlass', [
          { type: 'WindlassChamberFound', roomId: 4 },
          {
            type: 'TriviaRequired',
            direction: 'NORTH',
            question: {
              id: 'q3', topic: 'MATH', difficulty: 'KINDERGARTEN',
              question: 'next?', answers: ['a', 'b', 'c', 'd'], correctIndex: 0,
            },
          },
        ])
      const r = runAction(
        { type: 'SubmitAnswer', index: 2 },
        ctx(e, { before: trivia('NORTH', 2), windlassPending: true }),
      )
      expect(r.events.map((x) => x.type)).toEqual(['WindlassProgressed', 'TriviaRequired'])
    })

    it('clears the flag when the windlass slips or finishes', () => {
      const e = new FakeEngine().script_('answerWindlass', [{ type: 'WindlassSlipped', roomId: 4 }])
      const r = runAction(
        { type: 'SubmitAnswer', index: 0 },
        ctx(e, { before: trivia('NORTH', 2), windlassPending: true }),
      )
      expect(e.calls).toEqual(['answerWindlass(false)'])
      expect(r.windlassPending).toBe(false)
    })

    it('TurnWindlass sets the flag', () => {
      const e = new FakeEngine()
      const r = runAction({ type: 'TurnWindlass' }, ctx(e))
      expect(e.calls).toEqual(['turnWindlass'])
      expect(r.windlassPending).toBe(true)
    })
  })

  it('reports UseKey and CollectPickup without touching the engine', () => {
    // Keys are consumed automatically at a locked door and hints are collected on entry, so
    // these would otherwise be dead controls that silently did nothing.
    const e = new FakeEngine()
    const key = runAction({ type: 'UseKey' }, ctx(e))
    const pickup = runAction({ type: 'CollectPickup' }, ctx(e))
    expect(e.calls).toEqual([])
    expect(key.events).toEqual([{ type: 'InvalidAction', reason: 'Keys are used automatically' }])
    expect(pickup.events).toEqual([
      { type: 'InvalidAction', reason: 'Pickups are collected automatically' },
    ])
    expect(key.ran && pickup.ran).toBe(true)
  })

  it('routes the remaining actions to their engine calls', () => {
    const e = new FakeEngine()
    runAction({ type: 'PressButton' }, ctx(e))
    runAction({ type: 'UseHint' }, ctx(e))
    runAction({ type: 'CollectTreasure', points: 400 }, ctx(e))
    expect(e.calls).toEqual(['pressButton', 'useHint', 'collectCoin(400)'])
  })

  it('leaves windlassPending alone for actions that do not concern it', () => {
    const e = new FakeEngine()
    expect(runAction({ type: 'UseHint' }, ctx(e, { windlassPending: true })).windlassPending)
      .toBe(true)
  })
})

describe('withEntryDirection', () => {
  it('stamps the direction onto InGame and Trivia', () => {
    // The reducer builds both with no knowledge of entryDirection, so GameScreen would derive
    // forEntry(null) and frame every room as the start room without this.
    expect(withEntryDirection(inGame, 'EAST')).toMatchObject({ type: 'InGame', entryDirection: 'EAST' })
    expect(withEntryDirection(trivia('NORTH', 0), 'WEST'))
      .toMatchObject({ type: 'Trivia', entryDirection: 'WEST' })
  })

  it('leaves the other states untouched', () => {
    const menu: UiState = { type: 'Menu', settings: {
      topics: new Set(['MATH']), difficulty: 'KINDERGARTEN', complexity: 'SIMPLE',
    }, hasSavedGame: false }
    expect(withEntryDirection(menu, 'EAST')).toBe(menu)
  })
})
