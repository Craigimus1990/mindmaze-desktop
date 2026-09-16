import type { GameEvent } from '../engine/engine/GameEvent'
import { computeScore } from '../engine/engine/ScoreCalculator'
import type { GameState } from '../engine/model/GameState'
import type { PlayerAction } from './PlayerAction'
import type { UiState } from './UiState'

/**
 * Translates engine events into screen state.
 *
 * This layer owns presentation decisions only — what the player should see. Game rules
 * (traversal, door state, scoring) belong to GameEngine and are not duplicated here.
 */

/**
 * Folds `events` left-to-right over `current`.
 *
 * Order matters: a single engine call can return `Moved` followed by `TreasureFound`,
 * and the terminal Results state must win. Each event overwrites the accumulator, so
 * the last event decides the final state.
 *
 * `triggeredBy` disambiguates events that are identical for different intents —
 * PickupCollected(Hint) is emitted both when collecting a hint and when consuming one.
 */
export const reduce = (
  current: UiState,
  events: readonly GameEvent[],
  newState: GameState,
  triggeredBy: PlayerAction | null,
): UiState => events.reduce((acc, event) => apply(acc, event, newState, triggeredBy), current)

const apply = (
  current: UiState,
  event: GameEvent,
  newState: GameState,
  triggeredBy: PlayerAction | null,
): UiState => {
  switch (event.type) {
    case 'TriviaRequired':
      return {
        type: 'Trivia',
        game: newState,
        question: event.question,
        direction: event.direction,
        answers: event.question.answers,
        correctIndex: event.question.correctIndex,
      }

    case 'DoorOpened':
      return { type: 'InGame', game: newState }
    case 'Moved':
      return { type: 'InGame', game: newState }
    case 'DoorUnlocked':
      return { type: 'InGame', game: newState, toast: 'Unlocked!' }
    case 'WrongAnswer':
      return { type: 'InGame', game: newState, toast: 'Not quite!' }
    case 'GateFlipped':
      return { type: 'InGame', game: newState, toast: `Gate ${event.gatePairId} flipped!` }
    case 'InvalidAction':
      return { type: 'InGame', game: newState, toast: event.reason }

    // The player tried a treasure door they cannot yet pass. A modal rather than a toast:
    // it is the one message that tells them what the rest of the maze is for.
    case 'TreasureBlocked': {
      const lock = event.lock
      switch (lock.type) {
        case 'Locked':
          return {
            type: 'Message',
            game: newState,
            title: 'The door is locked',
            body:
              'A heavy iron lock holds this door fast. Somewhere in the castle there is ' +
              'a key that fits it — find it and come back.',
          }
        case 'Barred': {
          const left = lock.windlassRoomIds.size - lock.completed.size
          return {
            type: 'Message',
            game: newState,
            title: 'The way is barred',
            body:
              'A great iron portcullis blocks the way. Deep in the castle are two ' +
              'windlass chambers that raise it. ' +
              (left === lock.windlassRoomIds.size
                ? 'Find them both.'
                : 'You have raised one — find the other.'),
          }
        }
        // Should not arise: an open treasure is never blocked.
        case 'Open':
          return { type: 'InGame', game: newState }
      }
    }

    case 'WindlassChamberFound':
      return {
        type: 'Message',
        game: newState,
        title: 'A windlass chamber!',
        body:
          'This great winch raises the portcullis guarding the treasure — but it is ' +
          'stiff with age. Answer three questions in a row to turn it all the way. ' +
          'Get one wrong and it slips back to the start.\n\n' +
          'There is a second chamber like this one elsewhere in the castle. Both must be ' +
          'turned before the way opens.',
      }

    // Shown as a toast rather than a modal: it fires after every correct answer, and three
    // dialogs to dismiss per windlass would be worse than the information is worth.
    case 'WindlassProgressed':
      return {
        type: 'InGame',
        game: newState,
        toast: `The windlass turns... ${event.banked} of ${event.needed}`,
      }

    case 'WindlassSlipped':
      return {
        type: 'InGame',
        game: newState,
        toast: 'The windlass slips back! Start again.',
      }

    case 'WindlassRaised':
      return {
        type: 'Message',
        game: newState,
        title: 'The windlass turns!',
        body:
          event.remaining > 0
            ? 'Chains rattle somewhere far above. One windlass is raised — there is still ' +
              'another chamber to find.'
            : 'Chains rattle somewhere far above.',
      }

    case 'TreasureGateOpened':
      return {
        type: 'Message',
        game: newState,
        title: 'The portcullis rises!',
        body: 'Both windlasses are turned and the way to the treasure stands open.',
      }

    case 'WindlassAlreadyRaised':
      return {
        type: 'InGame',
        game: newState,
        toast: 'This windlass is already raised.',
      }

    case 'PickupCollected': {
      // useHint() and collecting a hint emit the same event; the action tells them apart.
      const consumedHint = triggeredBy?.type === 'UseHint'
      const toast = consumedHint
        ? 'Hint used!'
        : event.pickup.type === 'Coin'
          ? 'Found a coin!'
          : event.pickup.type === 'Key'
            ? 'Found a key!'
            : event.pickup.type === 'Hint'
              ? 'Found a hint!'
              : null

      if (consumedHint && current.type === 'Trivia') {
        return applyHint({ ...current, game: newState })
      }
      return { type: 'InGame', game: newState, toast }
    }

    case 'TreasureFound':
      return {
        type: 'Results',
        game: newState,
        breakdown: computeScore(
          newState.coinsCollected,
          newState.correctAnswers,
          newState.elapsedMillis,
          newState.treasureBonus,
        ),
      }
  }
}

/**
 * Narrows the displayed answers to the correct one plus a random wrong one.
 *
 * The engine's useHint() only decrements inventory — it has no knowledge of the pending
 * question — so this narrowing is entirely a UI concern. Idempotent: applying twice
 * leaves the state unchanged.
 *
 * Uses `Math.random()` unseeded, matching Kotlin's `randomOrNull()`/`shuffled()` — the
 * seeded engine Rng is deliberately not wired in here, since this is presentation, not
 * game logic that must replay deterministically.
 */
export const applyHint = (
  current: Extract<UiState, { type: 'Trivia' }>,
): Extract<UiState, { type: 'Trivia' }> => {
  if (current.hintUsed) return current

  const correctText = current.answers[current.correctIndex]
  if (correctText === undefined) return { ...current, hintUsed: true }

  const wrongAnswers = current.answers.filter((_, i) => i !== current.correctIndex)
  if (wrongAnswers.length === 0) return { ...current, hintUsed: true }
  const wrongText = wrongAnswers[Math.floor(Math.random() * wrongAnswers.length)]
  if (wrongText === undefined) return { ...current, hintUsed: true }

  // shuffle the 2-element narrowed list, matching Kotlin's `.shuffled()`
  const narrowed = Math.random() < 0.5 ? [correctText, wrongText] : [wrongText, correctText]
  return {
    ...current,
    answers: narrowed,
    correctIndex: narrowed.indexOf(correctText),
    hintUsed: true,
  }
}
