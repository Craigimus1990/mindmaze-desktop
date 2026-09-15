import type { Complexity, Difficulty, GameSettings, Topic } from '../../engine/model/types'
import { COMPLEXITIES, DIFFICULTIES, DIFFICULTY_ACTIVE, TOPICS } from '../../engine/model/types'
import { assetUrl } from '../../rendering/assetManifest'
import { current as currentBackdrop } from './MenuBackdrop'

/** Kotlin rendered enum names with underscores as spaces ("FIRST GRADE"). */
const label = (name: string): string => name.replace(/_/g, ' ')

export interface MenuScreenProps {
  readonly settings: GameSettings
  readonly hasSavedGame: boolean
  readonly musicEnabled: boolean
  readonly onSettingsChange: (settings: GameSettings) => void
  readonly onStart: () => void
  readonly onResume: () => void
  readonly onEditQuestions: () => void
  readonly onToggleMusic: (on: boolean) => void
}

export const MenuScreen = ({
  settings,
  hasSavedGame,
  musicEnabled,
  onSettingsChange,
  onStart,
  onResume,
  onEditQuestions,
  onToggleMusic,
}: MenuScreenProps) => {
  const toggleTopic = (topic: Topic): void => {
    const next = new Set(settings.topics)
    if (next.has(topic)) next.delete(topic)
    else next.add(topic)
    // A player can never deselect their last topic. Without this guard an empty selection
    // reaches SettingsStore, which treats a stored empty set as "use all topics" — so the
    // setting would not even round-trip as chosen — and pushes TriviaRepository onto its
    // whole-bank fallback, silently ignoring the selection the player made.
    if (next.size > 0) onSettingsChange({ ...settings, topics: next })
  }

  return (
    <div
      className="menu-screen"
      // One of three gates, picked per launch — see MenuBackdrop for why the choice lives
      // outside the component rather than in a useMemo here.
      //
      // Cover rather than contain: the art is 1.79 and the window runs from ~1.3 to 2.2, so
      // fitting would letterbox. The gate sits right of centre and the left third is
      // deliberately calm sky, which survives a centre crop either way.
      style={{ backgroundImage: `url(${assetUrl(currentBackdrop) ?? ''})` }}
    >
      {/* The menu text is light-on-art; without this it competes with the sky and hills.
          Strongest at the left, where the controls actually sit. */}
      <div className="menu-scrim" />

      <div className="menu-content">
        <h1 className="menu-title">MindMaze</h1>

        <h2 className="menu-heading">Topics</h2>
        <div className="chip-row">
          {TOPICS.map((topic) => (
            <button
              type="button"
              key={topic}
              className={`chip${settings.topics.has(topic) ? ' chip-selected' : ''}`}
              onClick={() => toggleTopic(topic)}
            >
              {topic}
            </button>
          ))}
        </div>

        <h2 className="menu-heading">Difficulty</h2>
        {/* Only the shipped tiers. Showing the rest greyed-out spent the whole row width on
            seven unplayable chips and pushed ADULT off the right edge of the screen. */}
        <div className="chip-row">
          {DIFFICULTIES.filter((d) => DIFFICULTY_ACTIVE[d]).map((d: Difficulty) => (
            <button
              type="button"
              key={d}
              className={`chip${settings.difficulty === d ? ' chip-selected' : ''}`}
              onClick={() => onSettingsChange({ ...settings, difficulty: d })}
            >
              {label(d)}
            </button>
          ))}
        </div>

        <h2 className="menu-heading">Maze Complexity</h2>
        <div className="chip-row">
          {COMPLEXITIES.map((c: Complexity) => (
            <button
              type="button"
              key={c}
              className={`chip${settings.complexity === c ? ' chip-selected' : ''}`}
              onClick={() => onSettingsChange({ ...settings, complexity: c })}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="menu-actions">
          <button type="button" className="btn btn-primary" onClick={onStart}>Start Game</button>
          {hasSavedGame ? (
            <button type="button" className="btn" onClick={onResume}>Resume Game</button>
          ) : null}
          <button type="button" className="btn" onClick={onEditQuestions}>Questions</button>
          {/* Music lives on the menu rather than in-game: it is a set-once preference for a
              car ride, not something to fiddle with mid-maze. */}
          <button type="button" className="btn" onClick={() => onToggleMusic(!musicEnabled)}>
            {musicEnabled ? '🔊 Music on' : '🔇 Music off'}
          </button>
        </div>
      </div>
    </div>
  )
}
