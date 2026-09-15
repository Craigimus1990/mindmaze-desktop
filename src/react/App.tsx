import { useCallback, useEffect, useRef, useState } from 'react'
import { MusicPlayer } from '../audio/MusicPlayer'
import { ImageAssetManager } from '../rendering/ImageAssetManager'
import { ASSET_NAMES } from '../rendering/assetManifest'
import { SettingsStore } from '../persistence/SettingsStore'
import { GameHost } from './GameHost'
import { useGame } from './useGame'
import { MenuScreen } from './screens/MenuScreen'
import { MessageDialog } from './screens/MessageDialog'
import { QuestionsScreen } from './screens/QuestionsScreen'
import { ResultsScreen } from './screens/ResultsScreen'
import { TriviaDialog } from './screens/TriviaDialog'
import './styles.css'

/**
 * Drawables that must be decoded before the first frame.
 *
 * A room drawn before its backdrop has arrived flashes empty, so the game waits on these. The
 * full set is every asset the app can reach, which is only ~130 small files and preloads in a
 * few milliseconds from the local filesystem — cheaper than working out per-room which backdrop
 * and character a maze will need, and it means no later navigation can ever hit an undecoded
 * image.
 */
const PRELOAD: readonly string[] = ASSET_NAMES

export const App = () => {
  const bridge = window.mindmaze
  const game = useGame(bridge)

  const imagesRef = useRef<ImageAssetManager | null>(null)
  if (imagesRef.current === null) imagesRef.current = new ImageAssetManager()
  const images = imagesRef.current

  const musicRef = useRef<MusicPlayer | null>(null)
  if (musicRef.current === null) musicRef.current = new MusicPlayer()
  const music = musicRef.current

  const settingsStoreRef = useRef<SettingsStore | null>(null)
  if (settingsStoreRef.current === null) settingsStoreRef.current = new SettingsStore(bridge)
  const settingsStore = settingsStoreRef.current

  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [musicEnabled, setMusicEnabled] = useState(true)

  useEffect(() => {
    let cancelled = false
    void images
      .preload(PRELOAD)
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch((e: unknown) => {
        // A missing drawable must not strand the player on a loading screen forever — say what
        // happened and let them see the app rather than a spinner that never resolves.
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e))
          setReady(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [images])

  useEffect(() => {
    void settingsStore.musicEnabled().then((on) => {
      setMusicEnabled(on)
      music.setEnabled(on)
    })
  }, [settingsStore, music])

  /**
   * Chromium blocks autoplay until the page has had a user gesture, so the track is started from
   * the first click anywhere rather than at load — starting it earlier fails silently and the
   * music never begins. `start()` is a no-op once playback is running, so this can fire on every
   * click without checking.
   */
  const onPointerDown = useCallback((): void => {
    music.start()
  }, [music])

  const toggleMusic = useCallback(
    (on: boolean): void => {
      setMusicEnabled(on)
      music.setEnabled(on)
      void settingsStore.setMusicEnabled(on)
      // A click landed to produce this, so the gesture requirement is already satisfied.
      if (on) music.start()
    },
    [music, settingsStore],
  )

  const state = game.uiState

  if (!ready) {
    return (
      <div className="loading-screen">
        <p>Lighting the torches…</p>
      </div>
    )
  }

  return (
    <div className="app" onPointerDown={onPointerDown}>
      {loadError !== null ? (
        <div className="load-error">{`Some artwork failed to load: ${loadError}`}</div>
      ) : null}

      {state.type === 'Menu' ? (
        <MenuScreen
          settings={state.settings}
          hasSavedGame={state.hasSavedGame}
          musicEnabled={musicEnabled}
          onSettingsChange={game.updateSettings}
          onStart={() => game.startGame(state.settings)}
          onResume={game.resumeGame}
          onEditQuestions={game.openQuestions}
          onToggleMusic={toggleMusic}
        />
      ) : null}

      {state.type === 'Questions' ? (
        <QuestionsScreen
          state={state}
          onSave={game.saveQuestion}
          onDelete={game.deleteQuestion}
          onBack={game.returnToMenu}
        />
      ) : null}

      {state.type === 'Results' ? (
        <ResultsScreen breakdown={state.breakdown} onBackToMenu={game.returnToMenu} />
      ) : null}

      {/* Trivia and Message are modals drawn *over* the room, so the room stays on screen
          underneath them — the player can still see the door they are standing at. */}
      {state.type === 'InGame' || state.type === 'Trivia' || state.type === 'Message' ? (
        <GameHost
          state={state}
          images={images}
          dispatch={game.dispatch}
          onDismissMessage={game.dismissMessage}
        />
      ) : null}

      {state.type === 'Trivia' ? (
        <TriviaDialog
          state={state}
          onAnswer={(index) => game.dispatch({ type: 'SubmitAnswer', index })}
          onUseHint={() => game.dispatch({ type: 'UseHint' })}
        />
      ) : null}

      {state.type === 'Message' ? (
        <MessageDialog state={state} onDismiss={game.dismissMessage} />
      ) : null}
    </div>
  )
}
