import type { UiState } from '../../ui/UiState'
import { assetUrl } from '../../rendering/assetManifest'
import { Parchment } from './Parchment'

/**
 * Modal question dialog shown over the game view when a closed door is attempted.
 *
 * Renders `state.answers` as-is: a 2x2 grid normally, or a single row of two after a hint
 * narrows the choices. `onAnswer` receives the index into that *displayed* list, not the
 * original question's answer list — see `UiState.Trivia` for why.
 *
 * The Kotlin dialog carried its own microphone button, because it is modal and the game view's
 * mic behind it was unreachable. Voice is out of scope for the Electron port, so there is no mic
 * here and the hint button simply sits at the end of its row.
 */
export const TriviaDialog = ({
  state,
  onAnswer,
  onUseHint,
}: {
  readonly state: Extract<UiState, { type: 'Trivia' }>
  readonly onAnswer: (index: number) => void
  readonly onUseHint: () => void
}) => {
  // Chunked into pairs so a hint-narrowed set renders as a single row rather than a ragged grid.
  const rows: (readonly string[])[] = []
  for (let i = 0; i < state.answers.length; i += 2) rows.push(state.answers.slice(i, i + 2))

  return (
    <div className="dialog-scrim">
      <Parchment className="trivia-dialog">
        {/* Long ADULT questions used to run past the dialog and get clipped mid-word. */}
        <p className="trivia-question">{state.question.question}</p>

        {rows.map((row, rowIndex) => (
          <div className="answer-row" key={rowIndex}>
            {row.map((answer, colIndex) => {
              const index = rowIndex * 2 + colIndex
              return (
                // A wooden plaque rather than a plain button. The art is a 9-patch, so only its
                // plain middle stretches — the iron end-bands keep their proportions whatever
                // the answer's length. Bold on purpose: thicker strokes put more of each letter
                // clear of the plaque's wood grain instead of skimming it, which helps beyond
                // what the contrast ratio alone measures.
                <button
                  type="button"
                  key={index}
                  className="plaque answer-plaque"
                  style={{ borderImageSource: `url(${assetUrl('ui_answer_plate.9') ?? ''})` }}
                  onClick={() => onAnswer(index)}
                >
                  {answer}
                </button>
              )
            })}
          </div>
        ))}

        <div className="trivia-footer">
          {!state.hintUsed && state.game.inventory.hints > 0 ? (
            <button type="button" className="btn btn-hint" onClick={onUseHint}>
              {`💡 Use hint (${state.game.inventory.hints})`}
            </button>
          ) : null}
        </div>
      </Parchment>
    </div>
  )
}
