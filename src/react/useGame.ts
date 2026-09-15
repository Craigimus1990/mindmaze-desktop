import { useCallback, useEffect, useRef, useState } from 'react'
import { GameEngine } from '../engine/engine/GameEngine'
import type { GameEvent } from '../engine/engine/GameEvent'
import { generate } from '../engine/engine/MazeGenerator'
import { TriviaRepository } from '../engine/engine/TriviaRepository'
import type { Direction } from '../engine/model/Direction'
import { opposite } from '../engine/model/Direction'
import type { GameState } from '../engine/model/GameState'
import type { GameSettings } from '../engine/model/types'
import { GameStateStore } from '../persistence/GameStateStore'
import { QuestionBank } from '../persistence/QuestionBank'
import { QuestionStore } from '../persistence/QuestionStore'
import { SettingsStore } from '../persistence/SettingsStore'
import type { MindMazeBridge } from '../types/window'
import type { PlayerAction } from '../ui/PlayerAction'
import type { UiState } from '../ui/UiState'
import { reduce } from '../ui/UiStateReducer'
import bundledQuestionsJson from '../assets/data/questions.json?raw'

/**
 * The direction the player would be walking if this action completes.
 *
 * Split out from {@link runAction} so the "which way did we go" question — the input to the
 * confirmed-move gate — can be asserted on its own, without an engine.
 *
 * `Move`/`AttemptDoor` carry their direction; `MoveBack` retraces the way the player came in;
 * a `SubmitAnswer` completes whatever move the pending question was blocking. Everything else
 * (hints, pickups, the windlass) leaves the player where they are.
 */
export const movedDirectionFor = (
  action: PlayerAction,
  before: UiState,
  entryDirection: Direction | null,
): Direction | null => {
  switch (action.type) {
    case 'Move':
    case 'AttemptDoor':
      return action.direction
    case 'MoveBack':
      return entryDirection
    case 'SubmitAnswer':
      return before.type === 'Trivia' ? before.direction : null
    default:
      return null
  }
}

/**
 * Whether the events returned by an engine call mean the player actually changed rooms.
 *
 * This is the gate on updating `entryDirection`: the engine can reject a move outright
 * (`InvalidAction`, a closed gate) or defer it behind a question (`TriviaRequired`), and in both
 * cases the player stays put. Re-framing the room then would turn the view while the player has
 * not moved. `TreasureFound` counts because reaching the treasure IS a move — it just ends the
 * game on arrival.
 */
export const isConfirmedMove = (events: readonly GameEvent[]): boolean =>
  events.some((e) => e.type === 'Moved' || e.type === 'TreasureFound')

/** What {@link runAction} needs from the world, so it can be driven by a test double. */
export interface ActionContext {
  readonly engine: GameEngine
  readonly before: UiState
  readonly entryDirection: Direction | null
  /** True while the question on screen belongs to a windlass rather than a door. */
  readonly windlassPending: boolean
}

export interface ActionResult {
  readonly events: readonly GameEvent[]
  readonly windlassPending: boolean
  /** False when the action could not run at all (MoveBack with nowhere to go, an answer with no
   *  question on screen); the caller leaves every piece of state untouched in that case, matching
   *  Kotlin's early `return` from those branches. */
  readonly ran: boolean
}

/**
 * Maps a {@link PlayerAction} onto the engine calls it stands for.
 *
 * Extracted as a pure function from the hook so this — the part with real branching, and the part
 * that would break silently — is testable without React or a DOM. The hook is then only the
 * plumbing around it: refs, the clock, and persistence.
 */
export const runAction = (action: PlayerAction, ctx: ActionContext): ActionResult => {
  const { engine, before, windlassPending } = ctx
  const notRun: ActionResult = { events: [], windlassPending, ran: false }

  switch (action.type) {
    case 'AttemptDoor':
    case 'Move':
      return { events: engine.move(action.direction), windlassPending, ran: true }

    case 'MoveBack': {
      const back = ctx.entryDirection
      // The start room has nothing to go back to. Kotlin returned early here; the button that
      // would trigger it is hidden in that room for the same reason.
      if (back === null) return notRun
      return { events: engine.move(back), windlassPending, ran: true }
    }

    case 'SubmitAnswer': {
      if (before.type !== 'Trivia') return notRun
      // A windlass question and a door question look identical on screen but resolve
      // differently: a wrong door answer just keeps the door shut, while a wrong windlass
      // answer discards banked progress.
      if (windlassPending) {
        const result = engine.answerWindlass(action.index === before.correctIndex)
        // Banked but not finished: ask the next question straight away rather than returning
        // to the room. Making the player re-tap the winch for each question read as "one
        // question and done", which is how a windlass got raised after a single answer.
        if (result.some((e) => e.type === 'WindlassProgressed')) {
          const next = engine.turnWindlass().filter((e) => e.type !== 'WindlassChamberFound')
          return { events: [...result, ...next], windlassPending: true, ran: true }
        }
        return { events: result, windlassPending: false, ran: true }
      }
      return {
        events: engine.submitAnswer(action.index, before.correctIndex),
        windlassPending: false,
        ran: true,
      }
    }

    case 'PressButton':
      return { events: engine.pressButton(), windlassPending, ran: true }

    case 'UseHint':
      return { events: engine.useHint(), windlassPending, ran: true }

    // Keys are consumed automatically at a locked door, so the old manual action would
    // otherwise silently do nothing. Reporting that is better than a dead control.
    case 'UseKey':
      return {
        events: [{ type: 'InvalidAction', reason: 'Keys are used automatically' }],
        windlassPending,
        ran: true,
      }

    case 'CollectTreasure':
      return { events: engine.collectCoin(action.points), windlassPending, ran: true }

    case 'TurnWindlass':
      return { events: engine.turnWindlass(), windlassPending: true, ran: true }

    // Hints are collected on entry; same reasoning as UseKey.
    case 'CollectPickup':
      return {
        events: [{ type: 'InvalidAction', reason: 'Pickups are collected automatically' }],
        windlassPending,
        ran: true,
      }
  }
}

/**
 * Stamps the hook-tracked `entryDirection` onto the reduced state.
 *
 * `reduce` builds `InGame`/`Trivia` with no knowledge of `entryDirection` — it is tracked here,
 * not in `GameState` — so it has to be copied on afterwards. `GameScreen` is then a pure function
 * of `UiState` and can derive `forEntry(...)` itself.
 */
export const withEntryDirection = (state: UiState, entryDirection: Direction | null): UiState => {
  if (state.type === 'InGame' || state.type === 'Trivia') return { ...state, entryDirection }
  return state
}

export interface Game {
  readonly uiState: UiState
  readonly dispatch: (action: PlayerAction) => void
  readonly startGame: (settings: GameSettings) => void
  readonly resumeGame: () => void
  readonly updateSettings: (settings: GameSettings) => void
  readonly dismissMessage: () => void
  readonly returnToMenu: () => void
  readonly openQuestions: () => void
  readonly saveQuestion: (entry: QuestionBank.Entry) => void
  readonly deleteQuestion: (id: string) => void
}

/**
 * Wires {@link reduce} to {@link GameEngine} and persistence. Holds the only mutable state in the
 * UI layer; everything downstream (screens, renderers) observes `uiState`.
 *
 * The port of Kotlin's `GameViewModel`, minus its voice handling, which is out of scope here.
 *
 * Persistence uses two independent `GameStateStore` slots, per its existing contract:
 *  - active: a live snapshot of the current playthrough, updated after every action so the
 *    game can resume mid-maze after a crash or a reload.
 *  - cross-session: the durable "Resume Game" entry surfaced on the menu; mirrored alongside
 *    active on every persist and cleared once the maze is completed.
 *
 * The Android version's stores were synchronous (SharedPreferences and a blocking file read);
 * everything here crosses the sandboxed IPC bridge and is therefore a promise. That changes the
 * shape of the code but not its behaviour: the initial menu state is loaded in an effect rather
 * than in the constructor, and every persist is fire-and-forget rather than awaited — exactly
 * what the Kotlin did, which never awaited its writes either.
 */
export const useGame = (bridge: MindMazeBridge): Game => {
  const stores = useRef<{
    settings: SettingsStore
    gameState: GameStateStore
    questions: QuestionStore
  } | null>(null)
  if (stores.current === null) {
    stores.current = {
      settings: new SettingsStore(bridge),
      gameState: new GameStateStore(bridge),
      questions: new QuestionStore(bridge),
    }
  }
  const { settings: settingsStore, gameState: gameStateStore, questions: questionStore } =
    stores.current

  const engineRef = useRef<GameEngine | null>(null)
  const entryDirectionRef = useRef<Direction | null>(null)
  const windlassPendingRef = useRef(false)

  /**
   * Wall-clock time the current session's clock counts from, already adjusted for any elapsed
   * time on a resumed game — so elapsed is always `now - sessionStart` and resuming does not
   * reset the clock (and with it the time bonus).
   */
  const sessionStartRef = useRef(0)

  const [uiState, setUiState] = useState<UiState>({
    type: 'Menu',
    // Real values arrive from the effect below; this is only what shows for the first frame.
    settings: { topics: new Set(), difficulty: 'KINDERGARTEN', complexity: 'SIMPLE' },
    hasSavedGame: false,
  })

  /** `uiState` as the callbacks below need it, without making every one of them re-create on
   *  each render — the keyboard handler is registered against these and would otherwise be
   *  torn down and re-added every frame. */
  const uiStateRef = useRef(uiState)
  uiStateRef.current = uiState

  const currentElapsedMillis = (): number => Date.now() - sessionStartRef.current

  /**
   * The question pool: the bundled asset merged with the player's own additions and minus any
   * bundled questions they deleted. Read fresh on each game start so a question added from the
   * questions screen is available immediately, without restarting the app.
   */
  const questionsJson = useCallback(
    (): Promise<string> => questionStore.mergedJson(bundledQuestionsJson),
    [questionStore],
  )

  const menuState = useCallback(async (): Promise<UiState> => {
    const [settings, active, saved] = await Promise.all([
      settingsStore.load(),
      gameStateStore.loadActive(),
      gameStateStore.loadCrossSession(),
    ])
    return { type: 'Menu', settings, hasSavedGame: (active ?? saved) !== null }
  }, [settingsStore, gameStateStore])

  useEffect(() => {
    let cancelled = false
    void menuState().then((s) => {
      if (!cancelled) setUiState(s)
    })
    return () => {
      cancelled = true
    }
  }, [menuState])

  /**
   * Persists alongside `entryDirection`; see `SavedGame` for why the engine state alone is not
   * enough to restore the view the player was looking at.
   */
  const persist = useCallback(
    (state: GameState): void => {
      if (state.isComplete) {
        // A finished game must not be offered as "Resume" — the menu would invite the player
        // back into a maze they have already won.
        void gameStateStore.clearActive()
        void gameStateStore.clearSaved()
      } else {
        const game = { state, entryDirection: entryDirectionRef.current }
        void gameStateStore.saveActive(game)
        void gameStateStore.saveCrossSession(game)
      }
    },
    [gameStateStore],
  )

  /**
   * Advances the clock on the in-flight game state once per second, independent of player
   * actions, so the HUD clock and eventual time-bonus scoring reflect real elapsed time.
   *
   * Recomputed as `now - sessionStart` rather than incremented: a counter drifts whenever the
   * interval is throttled (a backgrounded window fires it far less than once a second), and the
   * time bonus would then quietly reward leaving the game minimised.
   */
  useEffect(() => {
    if (uiState.type !== 'InGame' && uiState.type !== 'Trivia') return
    const id = setInterval(() => {
      const engine = engineRef.current
      if (engine === null) return
      const current = uiStateRef.current
      if (current.type !== 'InGame' && current.type !== 'Trivia') return

      const newState: GameState = { ...engine.getState(), elapsedMillis: currentElapsedMillis() }
      setUiState({ ...current, game: newState })
      persist(newState)
    }, 1000)
    return () => clearInterval(id)
  }, [uiState.type, persist])

  /** `restoredEntryDirection` is null for a new game (the start room has nothing to face away
   *  from) and carries the persisted facing when resuming. */
  const launchEngine = useCallback(
    async (state: GameState, restoredEntryDirection: Direction | null): Promise<void> => {
      const repo = new TriviaRepository(
        await questionsJson(),
        state.settings.topics,
        state.settings.difficulty,
      )
      engineRef.current = new GameEngine(state, repo)
      entryDirectionRef.current = restoredEntryDirection
      windlassPendingRef.current = false
      // A resumed game already has elapsedMillis recorded; keep the clock running from there
      // instead of resetting it to zero.
      sessionStartRef.current = Date.now() - state.elapsedMillis
      setUiState({ type: 'InGame', game: state, entryDirection: restoredEntryDirection })
      persist(state)
    },
    [questionsJson, persist],
  )

  const startGame = useCallback(
    (settings: GameSettings): void => {
      void (async () => {
        await settingsStore.save(settings)
        const maze = generate(settings.complexity)
        const state: GameState = {
          maze,
          currentRoomId: maze.startId,
          visitedRoomIds: new Set([maze.startId]),
          inventory: { keys: 0, hints: 0 },
          coinsCollected: 0,
          treasureBonus: 0,
          windlassProgress: new Map(),
          correctAnswers: 0,
          elapsedMillis: 0,
          settings,
          isComplete: false,
        }
        await gameStateStore.clearActive()
        await gameStateStore.clearSaved()
        await launchEngine(state, null)
      })()
    },
    [settingsStore, gameStateStore, launchEngine],
  )

  const resumeGame = useCallback((): void => {
    void (async () => {
      const saved = (await gameStateStore.loadActive()) ?? (await gameStateStore.loadCrossSession())
      if (saved === null) return
      await launchEngine(saved.state, saved.entryDirection)
    })()
  }, [gameStateStore, launchEngine])

  const updateSettings = useCallback(
    (settings: GameSettings): void => {
      void settingsStore.save(settings)
      const current = uiStateRef.current
      if (current.type === 'Menu') setUiState({ ...current, settings })
    },
    [settingsStore],
  )

  /** Closes a story message and returns to the room it was shown over. */
  const dismissMessage = useCallback((): void => {
    const current = uiStateRef.current
    if (current.type === 'Message') {
      setUiState({
        type: 'InGame',
        game: current.game,
        entryDirection: entryDirectionRef.current,
      })
    }
  }, [])

  const returnToMenu = useCallback((): void => {
    engineRef.current = null
    windlassPendingRef.current = false
    void menuState().then(setUiState)
  }, [menuState])

  // ---- question bank editing ----

  /** Opens the question editor, showing the same merged pool a game would draw from. */
  const openQuestions = useCallback((): void => {
    void (async () => {
      const [settings, merged, custom] = await Promise.all([
        settingsStore.load(),
        questionsJson(),
        questionStore.custom(),
      ])
      setUiState({
        type: 'Questions',
        settings,
        questions: QuestionBank.parse(merged),
        custom: new Set(custom.map((e) => e.id)),
      })
    })()
  }, [settingsStore, questionsJson, questionStore])

  /**
   * Adds a new question, or replaces an existing one with the same id.
   *
   * Editing a *bundled* question routes here too: the caller passes the bundled id, and the
   * edited copy is stored as a custom entry that `QuestionBank.merge` gives precedence to. The
   * asset itself is read-only and never changes.
   */
  const saveQuestion = useCallback(
    (entry: QuestionBank.Entry): void => {
      void (async () => {
        const current = (await questionStore.custom()).filter((e) => e.id !== entry.id)
        await questionStore.saveCustom([...current, entry])
        openQuestions()
      })()
    },
    [questionStore, openQuestions],
  )

  /**
   * Removes a question.
   *
   * A custom one is deleted outright; a bundled one is recorded as hidden, since the asset
   * cannot be edited. `QuestionBank.merge` refuses to honour hides that would empty the pool.
   */
  const deleteQuestion = useCallback(
    (id: string): void => {
      void (async () => {
        const custom = await questionStore.custom()
        if (custom.some((e) => e.id === id)) {
          await questionStore.saveCustom(custom.filter((e) => e.id !== id))
          // A custom entry saved under a bundled id was an override; dropping it should bring
          // the original back rather than leave the id hidden forever.
          await questionStore.unhide(id)
        } else {
          await questionStore.hide(id)
        }
        openQuestions()
      })()
    },
    [questionStore, openQuestions],
  )

  const dispatch = useCallback(
    (action: PlayerAction): void => {
      const engine = engineRef.current
      if (engine === null) return
      const before = uiStateRef.current

      // entryDirection is only recorded once the player actually moves — the engine can reject a
      // move outright (InvalidAction, closed gate) or defer it behind a trivia question
      // (TriviaRequired), in which case the player stays put and entryDirection must not change
      // until (if ever) a correct SubmitAnswer completes the move. The direction that would have
      // been walked is computed first, then reconciled against the events the engine actually
      // returned.
      const movedDirection = movedDirectionFor(action, before, entryDirectionRef.current)

      const result = runAction(action, {
        engine,
        before,
        entryDirection: entryDirectionRef.current,
        windlassPending: windlassPendingRef.current,
      })
      if (!result.ran) return
      windlassPendingRef.current = result.windlassPending

      if (isConfirmedMove(result.events) && movedDirection !== null) {
        entryDirectionRef.current = opposite(movedDirection)
      }

      // The engine's own state has no notion of wall-clock elapsed time; fold in the session
      // clock so every emitted/persisted GameState carries a live value.
      const newState: GameState = { ...engine.getState(), elapsedMillis: currentElapsedMillis() }
      const reduced = reduce(before, result.events, newState, action)
      setUiState(withEntryDirection(reduced, entryDirectionRef.current))
      persist(newState)
    },
    [persist],
  )

  return {
    uiState,
    dispatch,
    startGame,
    resumeGame,
    updateSettings,
    dismissMessage,
    returnToMenu,
    openQuestions,
    saveQuestion,
    deleteQuestion,
  }
}
