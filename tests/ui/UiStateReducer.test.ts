import { describe, it, expect } from 'vitest'
import { reduce, applyHint } from '@/ui/UiStateReducer'
import type { PlayerAction } from '@/ui/PlayerAction'
import type { UiState } from '@/ui/UiState'
import type { GameEvent } from '@/engine/engine/GameEvent'
import type { GameState } from '@/engine/model/GameState'
import { door } from '@/engine/model/Room'
import type { TriviaQuestion } from '@/engine/model/types'

const settings = () => ({
  topics: new Set<'MATH'>(['MATH']),
  difficulty: 'KINDERGARTEN' as const,
  complexity: 'SIMPLE' as const,
})

const maze = () => ({
  rooms: new Map([
    [0, { id: 0, exits: new Map([['EAST', door('CLOSED')]] as const), pickup: { type: 'None' as const }, buttonGatePairId: null }],
    [1, { id: 1, exits: new Map([['WEST', door('CLOSED')]] as const), pickup: { type: 'None' as const }, buttonGatePairId: null }],
  ]),
  gatePairs: new Map(),
  startId: 0,
  treasureId: 1,
  treasureLock: { type: 'Open' as const },
})

const state = (roomId = 0, complete = false): GameState => ({
  maze: maze(),
  currentRoomId: roomId,
  visitedRoomIds: new Set([0]),
  inventory: { keys: 0, hints: 1 },
  coinsCollected: 2,
  treasureBonus: 0,
  windlassProgress: new Map(),
  correctAnswers: 1,
  elapsedMillis: 60_000,
  settings: settings(),
  isComplete: complete,
})

const question = (): TriviaQuestion => ({
  id: 'q1',
  topic: 'MATH',
  difficulty: 'KINDERGARTEN',
  question: 'What is 2 + 2?',
  answers: ['3', '4', '5', '6'],
  correctIndex: 1,
})

const inGame = (roomId = 0): UiState => ({ type: 'InGame', game: state(roomId) })

describe('UiStateReducer', () => {
  it('attempting a closed door opens the trivia dialog', () => {
    const events: GameEvent[] = [{ type: 'TriviaRequired', question: question(), direction: 'EAST' }]
    const action: PlayerAction = { type: 'AttemptDoor', direction: 'EAST' }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('Trivia')
    if (result.type !== 'Trivia') throw new Error('expected Trivia')
    expect(result.question.question).toBe('What is 2 + 2?')
    expect(result.direction).toBe('EAST')
    expect(result.answers.length).toBe(4)
    expect(result.correctIndex).toBe(1)
  })

  it('wrong answer returns to game without moving', () => {
    const trivia: UiState = {
      type: 'Trivia', game: state(), question: question(), direction: 'EAST',
      answers: question().answers, correctIndex: 1,
    }
    const action: PlayerAction = { type: 'SubmitAnswer', index: 0 }
    const result = reduce(trivia, [{ type: 'WrongAnswer' }], state(0), action)

    expect(result.type).toBe('InGame')
    if (result.type !== 'InGame') throw new Error('expected InGame')
    expect(result.game.currentRoomId).toBe(0)
    expect(result.toast).toBe('Not quite!')
  })

  it('correct answer dismisses dialog and moves player', () => {
    const trivia: UiState = {
      type: 'Trivia', game: state(), question: question(), direction: 'EAST',
      answers: question().answers, correctIndex: 1,
    }
    const events: GameEvent[] = [{ type: 'DoorOpened', newRoomId: 1 }, { type: 'Moved', newRoomId: 1 }]
    const action: PlayerAction = { type: 'SubmitAnswer', index: 1 }
    const result = reduce(trivia, events, state(1), action)

    expect(result.type).toBe('InGame')
    if (result.type !== 'InGame') throw new Error('expected InGame')
    expect(result.game.currentRoomId).toBe(1)
  })

  it('moving through an open door never shows trivia', () => {
    const action: PlayerAction = { type: 'Move', direction: 'EAST' }
    const result = reduce(inGame(), [{ type: 'Moved', newRoomId: 1 }], state(1), action)

    expect(result.type).toBe('InGame')
    if (result.type !== 'InGame') throw new Error('expected InGame')
    expect(result.game.currentRoomId).toBe(1)
  })

  it('treasure found produces results even when preceded by moved', () => {
    const events: GameEvent[] = [{ type: 'Moved', newRoomId: 1 }, { type: 'TreasureFound' }]
    const action: PlayerAction = { type: 'Move', direction: 'EAST' }
    const result = reduce(inGame(), events, state(1, true), action)

    expect(result.type).toBe('Results')
    if (result.type !== 'Results') throw new Error('expected Results')
    // 2 coins * 100 + 1 answer * 50 = 250, plus a positive time bonus
    expect(result.breakdown.coinPoints).toBe(200)
    expect(result.breakdown.answerPoints).toBe(50)
    expect(result.breakdown.timeBonus).toBeGreaterThan(0)
  })

  it('invalid action stays in game and surfaces the reason', () => {
    const events: GameEvent[] = [{ type: 'InvalidAction', reason: 'No key in inventory' }]
    const action: PlayerAction = { type: 'UseKey' }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('InGame')
    if (result.type !== 'InGame') throw new Error('expected InGame')
    expect(result.toast).toBe('No key in inventory')
  })

  it('pickup collected in game shows a toast without narrowing anything', () => {
    const events: GameEvent[] = [{ type: 'PickupCollected', pickup: { type: 'Hint' } }]
    const action: PlayerAction = { type: 'Move', direction: 'EAST' }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('InGame')
    if (result.type !== 'InGame') throw new Error('expected InGame')
    expect(result.toast).toBe('Found a hint!')
  })

  it('applying a hint narrows answers to two and remaps the correct index', () => {
    const trivia: UiState & { type: 'Trivia' } = {
      type: 'Trivia', game: state(), question: question(), direction: 'EAST',
      answers: question().answers, correctIndex: 1,
    }
    const result = applyHint(trivia)

    expect(result.answers.length).toBe(2)
    expect(result.hintUsed).toBe(true)
    expect(result.answers[result.correctIndex]).toBe('4')
  })

  it('applying a hint twice is a no-op', () => {
    const trivia: UiState & { type: 'Trivia' } = {
      type: 'Trivia', game: state(), question: question(), direction: 'EAST',
      answers: question().answers, correctIndex: 1,
    }
    const once = applyHint(trivia)
    const twice = applyHint(once)

    expect(twice).toBe(once)
  })

  it('using a hint during trivia narrows answers without leaving the dialog', () => {
    const trivia: UiState = {
      type: 'Trivia', game: state(), question: question(), direction: 'EAST',
      answers: question().answers, correctIndex: 1,
    }
    const events: GameEvent[] = [{ type: 'PickupCollected', pickup: { type: 'Hint' } }]
    const action: PlayerAction = { type: 'UseHint' }
    const result = reduce(trivia, events, state(), action)

    expect(result.type).toBe('Trivia')
    if (result.type !== 'Trivia') throw new Error('expected Trivia')
    expect(result.answers.length).toBe(2)
    expect(result.answers[result.correctIndex]).toBe('4')
  })

  it('using a hint outside trivia falls back to a toast', () => {
    const events: GameEvent[] = [{ type: 'PickupCollected', pickup: { type: 'Hint' } }]
    const action: PlayerAction = { type: 'UseHint' }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('InGame')
    if (result.type !== 'InGame') throw new Error('expected InGame')
    expect(result.toast).toBe('Hint used!')
  })

  it('gate flipped shows a toast', () => {
    const events: GameEvent[] = [{ type: 'GateFlipped', gatePairId: 'A' }]
    const action: PlayerAction = { type: 'PressButton' }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('InGame')
    if (result.type !== 'InGame') throw new Error('expected InGame')
    expect(result.toast).toBe('Gate A flipped!')
  })

  it('the windlass explainer does not swallow the question', () => {
    // turnWindlass emits the explainer AND the question together on a first visit. The
    // reducer folds events in order, so the question must be the one left standing —
    // otherwise the player reads the rules and is then returned to the room having been
    // asked nothing.
    const events: GameEvent[] = [
      { type: 'WindlassChamberFound', roomId: 1 },
      { type: 'TriviaRequired', question: question(), direction: 'NORTH' },
    ]
    const action: PlayerAction = { type: 'TurnWindlass' }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('Trivia')
  })

  it('door unlocked shows a toast', () => {
    const events: GameEvent[] = [{ type: 'DoorUnlocked', direction: 'EAST' }]
    const action: PlayerAction = { type: 'UseKey' }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('InGame')
    if (result.type !== 'InGame') throw new Error('expected InGame')
    expect(result.toast).toBe('Unlocked!')
  })

  it('treasure blocked by a Locked lock shows the locked-door modal', () => {
    const events: GameEvent[] = [
      { type: 'TreasureBlocked', lock: { type: 'Locked', keyRoomId: 5 } },
    ]
    const action: PlayerAction = { type: 'AttemptDoor', direction: 'EAST' }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('Message')
    if (result.type !== 'Message') throw new Error('expected Message')
    expect(result.title).toBe('The door is locked')
    expect(result.body).toBe(
      'A heavy iron lock holds this door fast. Somewhere in the castle there is ' +
        'a key that fits it — find it and come back.',
    )
  })

  it('treasure blocked by a Barred lock with neither windlass raised says find them both', () => {
    const events: GameEvent[] = [
      {
        type: 'TreasureBlocked',
        lock: { type: 'Barred', windlassRoomIds: new Set([1, 2]), completed: new Set() },
      },
    ]
    const action: PlayerAction = { type: 'AttemptDoor', direction: 'EAST' }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('Message')
    if (result.type !== 'Message') throw new Error('expected Message')
    expect(result.title).toBe('The way is barred')
    expect(result.body).toBe(
      'A great iron portcullis blocks the way. Deep in the castle are two ' +
        'windlass chambers that raise it. ' +
        'Find them both.',
    )
  })

  it('treasure blocked by a Barred lock with one windlass raised says find the other', () => {
    const events: GameEvent[] = [
      {
        type: 'TreasureBlocked',
        lock: { type: 'Barred', windlassRoomIds: new Set([1, 2]), completed: new Set([1]) },
      },
    ]
    const action: PlayerAction = { type: 'AttemptDoor', direction: 'EAST' }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('Message')
    if (result.type !== 'Message') throw new Error('expected Message')
    expect(result.title).toBe('The way is barred')
    expect(result.body).toBe(
      'A great iron portcullis blocks the way. Deep in the castle are two ' +
        'windlass chambers that raise it. ' +
        'You have raised one — find the other.',
    )
  })

  it('treasure blocked by an Open lock should not arise, falls back to InGame', () => {
    const events: GameEvent[] = [{ type: 'TreasureBlocked', lock: { type: 'Open' } }]
    const action: PlayerAction = { type: 'AttemptDoor', direction: 'EAST' }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('InGame')
  })

  it('windlass chamber found shows the explainer modal verbatim', () => {
    const events: GameEvent[] = [{ type: 'WindlassChamberFound', roomId: 1 }]
    const action: PlayerAction = { type: 'TurnWindlass' }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('Message')
    if (result.type !== 'Message') throw new Error('expected Message')
    expect(result.title).toBe('A windlass chamber!')
    expect(result.body).toBe(
      'This great winch raises the portcullis guarding the treasure — but it is ' +
        'stiff with age. Answer three questions in a row to turn it all the way. ' +
        'Get one wrong and it slips back to the start.\n\n' +
        'There is a second chamber like this one elsewhere in the castle. Both must be ' +
        'turned before the way opens.',
    )
  })

  it('windlass progressed shows a toast', () => {
    const events: GameEvent[] = [{ type: 'WindlassProgressed', roomId: 1, banked: 2, needed: 3 }]
    const action: PlayerAction = { type: 'SubmitAnswer', index: 1 }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('InGame')
    if (result.type !== 'InGame') throw new Error('expected InGame')
    expect(result.toast).toBe('The windlass turns... 2 of 3')
  })

  it('windlass slipped shows a toast', () => {
    const events: GameEvent[] = [{ type: 'WindlassSlipped', roomId: 1 }]
    const action: PlayerAction = { type: 'SubmitAnswer', index: 0 }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('InGame')
    if (result.type !== 'InGame') throw new Error('expected InGame')
    expect(result.toast).toBe('The windlass slips back! Start again.')
  })

  it('windlass raised with remaining windlasses says one is raised', () => {
    const events: GameEvent[] = [{ type: 'WindlassRaised', roomId: 1, remaining: 1 }]
    const action: PlayerAction = { type: 'SubmitAnswer', index: 1 }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('Message')
    if (result.type !== 'Message') throw new Error('expected Message')
    expect(result.title).toBe('The windlass turns!')
    expect(result.body).toBe(
      'Chains rattle somewhere far above. One windlass is raised — there is still ' +
        'another chamber to find.',
    )
  })

  it('windlass raised with none remaining shows the short body', () => {
    const events: GameEvent[] = [{ type: 'WindlassRaised', roomId: 1, remaining: 0 }]
    const action: PlayerAction = { type: 'SubmitAnswer', index: 1 }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('Message')
    if (result.type !== 'Message') throw new Error('expected Message')
    expect(result.title).toBe('The windlass turns!')
    expect(result.body).toBe('Chains rattle somewhere far above.')
  })

  it('treasure gate opened shows the modal verbatim', () => {
    const events: GameEvent[] = [{ type: 'TreasureGateOpened' }]
    const action: PlayerAction = { type: 'SubmitAnswer', index: 1 }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('Message')
    if (result.type !== 'Message') throw new Error('expected Message')
    expect(result.title).toBe('The portcullis rises!')
    expect(result.body).toBe('Both windlasses are turned and the way to the treasure stands open.')
  })

  it('windlass already raised shows a toast', () => {
    const events: GameEvent[] = [{ type: 'WindlassAlreadyRaised', roomId: 1 }]
    const action: PlayerAction = { type: 'TurnWindlass' }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('InGame')
    if (result.type !== 'InGame') throw new Error('expected InGame')
    expect(result.toast).toBe('This windlass is already raised.')
  })

  it('pickup collected for a coin shows found a coin', () => {
    const events: GameEvent[] = [{ type: 'PickupCollected', pickup: { type: 'Coin' } }]
    const action: PlayerAction = { type: 'Move', direction: 'EAST' }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('InGame')
    if (result.type !== 'InGame') throw new Error('expected InGame')
    expect(result.toast).toBe('Found a coin!')
  })

  it('pickup collected for a key shows found a key', () => {
    const events: GameEvent[] = [{ type: 'PickupCollected', pickup: { type: 'Key' } }]
    const action: PlayerAction = { type: 'Move', direction: 'EAST' }
    const result = reduce(inGame(), events, state(), action)

    expect(result.type).toBe('InGame')
    if (result.type !== 'InGame') throw new Error('expected InGame')
    expect(result.toast).toBe('Found a key!')
  })

  it('reduce folds multiple events left to right, last one wins', () => {
    const events: GameEvent[] = [
      { type: 'Moved', newRoomId: 1 },
      { type: 'GateFlipped', gatePairId: 'B' },
    ]
    const action: PlayerAction = { type: 'PressButton' }
    const result = reduce(inGame(), events, state(1), action)

    expect(result.type).toBe('InGame')
    if (result.type !== 'InGame') throw new Error('expected InGame')
    expect(result.toast).toBe('Gate B flipped!')
  })
})
