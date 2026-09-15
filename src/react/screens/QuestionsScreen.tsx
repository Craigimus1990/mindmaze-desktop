import { useState } from 'react'
import type { Difficulty, Topic } from '../../engine/model/types'
import { DIFFICULTIES, DIFFICULTY_ACTIVE, TOPICS } from '../../engine/model/types'
import { QuestionBank } from '../../persistence/QuestionBank'
import type { UiState } from '../../ui/UiState'

/** Kotlin rendered enum names with underscores as spaces ("FIRST GRADE"). */
const label = (name: string): string => name.replace(/_/g, ' ')

/** Older or hand-edited data might not carry exactly four answers; the form always shows four. */
const padTo4 = (answers: readonly string[]): string[] =>
  [...answers, '', '', '', ''].slice(0, 4)

/** Explains exactly why Save is disabled, rather than leaving the button mysteriously dead. */
const validationMessage = (
  question: string,
  answers: readonly string[],
  correct: number,
): string => {
  if (question.trim().length === 0) return 'Write the question.'
  if (answers.some((a) => a.trim().length === 0)) return 'Fill in all four answers.'
  if (new Set(answers.map((a) => a.trim().toLowerCase())).size !== answers.length) {
    return 'Two answers are the same — the question would be unanswerable.'
  }
  if (correct < 0 || correct >= answers.length) return 'Choose which answer is correct.'
  return 'Something is missing.'
}

/**
 * Add/edit form.
 *
 * Save stays disabled until {@link QuestionBank.isValid} passes, so an unusable question cannot
 * reach the pool — a blank answer renders as an empty button, and a duplicate makes the question
 * unanswerable since picking the matching "wrong" one is still marked incorrect.
 */
const QuestionEditor = ({
  entry,
  onDismiss,
  onSave,
}: {
  readonly entry: QuestionBank.Entry
  readonly onDismiss: () => void
  readonly onSave: (entry: QuestionBank.Entry) => void
}) => {
  const [question, setQuestion] = useState(entry.question)
  const [answers, setAnswers] = useState<string[]>(padTo4(entry.answers))
  const [correct, setCorrect] = useState(entry.correctIndex)

  const valid = QuestionBank.isValid(question, answers, correct)

  return (
    <div className="dialog-scrim">
      <div className="editor-card">
        <h2 className="editor-title">
          {entry.question.trim().length === 0 ? 'New question' : 'Edit question'}
        </h2>
        <p className="editor-subtitle">{`${entry.topic} · ${label(entry.difficulty)}`}</p>

        <label className="field">
          <span className="field-label">Question</span>
          <textarea
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>

        <p className="editor-hint">Answers — tap the circle to mark the correct one</p>

        {answers.map((a, i) => (
          <div className="answer-field" key={i}>
            <input
              type="radio"
              name="correct-answer"
              checked={i === correct}
              onChange={() => setCorrect(i)}
              aria-label={`Answer ${i + 1} is correct`}
            />
            <label className="field field-inline">
              <span className="field-label">{`Answer ${i + 1}`}</span>
              <input
                type="text"
                value={a}
                onChange={(e) =>
                  setAnswers(answers.map((prev, j) => (j === i ? e.target.value : prev)))
                }
              />
            </label>
          </div>
        ))}

        {!valid ? (
          <p className="editor-error">{validationMessage(question, answers, correct)}</p>
        ) : null}

        <div className="editor-actions">
          <button type="button" className="btn btn-text" onClick={onDismiss}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!valid}
            onClick={() =>
              onSave({
                ...entry,
                question: question.trim(),
                answers: answers.map((a) => a.trim()),
                correctIndex: correct,
              })
            }
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

const QuestionRow = ({
  entry,
  isCustom,
  onEdit,
  onDelete,
}: {
  readonly entry: QuestionBank.Entry
  readonly isCustom: boolean
  readonly onEdit: () => void
  readonly onDelete: () => void
}) => (
  <div className="question-row">
    <div className="question-row-main">
      <div className="question-row-head">
        <span className="question-text">{entry.question}</span>
        {/* Distinguishes what the player wrote from what shipped, which matters because
            deleting behaves differently for each. */}
        {isCustom ? <span className="badge">mine</span> : null}
      </div>
      <p className="question-answers">
        {entry.answers.map((a, i) => (i === entry.correctIndex ? `✓ ${a}` : a)).join('   ·   ')}
      </p>
    </div>
    <button type="button" className="btn btn-text" onClick={onEdit}>Edit</button>
    <button type="button" className="btn btn-text" onClick={onDelete}>Remove</button>
  </div>
)

/**
 * The question bank editor.
 *
 * Shows the merged pool — bundled plus the player's own — filtered to one topic and difficulty at
 * a time, because 124 bundled questions in one list is unusable. Bundled entries can be edited
 * (which stores an override) or removed (which records a hide); custom entries can be edited or
 * deleted outright.
 */
export const QuestionsScreen = ({
  state,
  onSave,
  onDelete,
  onBack,
}: {
  readonly state: Extract<UiState, { type: 'Questions' }>
  readonly onSave: (entry: QuestionBank.Entry) => void
  readonly onDelete: (id: string) => void
  readonly onBack: () => void
}) => {
  const [topic, setTopic] = useState<Topic>(
    [...state.settings.topics][0] ?? TOPICS[0]!,
  )
  const [difficulty, setDifficulty] = useState<Difficulty>(state.settings.difficulty)
  const [editing, setEditing] = useState<QuestionBank.Entry | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<QuestionBank.Entry | null>(null)

  const shown = state.questions.filter((q) => q.topic === topic && q.difficulty === difficulty)

  return (
    <div className="questions-screen">
      <div className="questions-header">
        <button type="button" className="btn" onClick={onBack}>← Back</button>
        <h1 className="questions-title">Questions</h1>
        <span className="questions-count">{`${shown.length} in this level`}</span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            setEditing({
              id: `custom-${crypto.randomUUID()}`,
              topic,
              difficulty,
              question: '',
              answers: ['', '', '', ''],
              correctIndex: 0,
            })
          }
        >
          + Add question
        </button>
      </div>

      {/* Topic and difficulty pick which bank is being edited. Questions are stored per
          (topic, difficulty), so this is the level selector, not a view filter. */}
      <div className="chip-row chip-row-scroll">
        {TOPICS.map((t) => (
          <button
            type="button"
            key={t}
            className={`chip${t === topic ? ' chip-selected' : ''}`}
            onClick={() => setTopic(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="chip-row">
        {DIFFICULTIES.filter((d) => DIFFICULTY_ACTIVE[d]).map((d) => (
          <button
            type="button"
            key={d}
            className={`chip${d === difficulty ? ' chip-selected' : ''}`}
            onClick={() => setDifficulty(d)}
          >
            {label(d)}
          </button>
        ))}
      </div>

      <hr className="divider" />

      {shown.length === 0 ? (
        <p className="questions-empty">
          {'No questions for this topic and difficulty yet.\nTap “Add question” to write one.'}
        </p>
      ) : (
        <div className="questions-list">
          {shown.map((q) => (
            <QuestionRow
              key={q.id}
              entry={q}
              isCustom={state.custom.has(q.id)}
              onEdit={() => setEditing(q)}
              onDelete={() => setConfirmDelete(q)}
            />
          ))}
        </div>
      )}

      {editing !== null ? (
        <QuestionEditor
          entry={editing}
          onDismiss={() => setEditing(null)}
          onSave={(saved) => {
            setEditing(null)
            onSave(saved)
          }}
        />
      ) : null}

      {confirmDelete !== null ? (
        <div className="dialog-scrim">
          <div className="editor-card confirm-card">
            <h2 className="editor-title">Remove this question?</h2>
            <p className="confirm-body">
              {state.custom.has(confirmDelete.id)
                ? `“${confirmDelete.question}” will be deleted.`
                : `“${confirmDelete.question}” is a built-in question. It will be hidden from ` +
                  'the game, and can be brought back by removing it again later.'}
            </p>
            <div className="editor-actions">
              <button
                type="button"
                className="btn btn-text"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-text"
                onClick={() => {
                  const id = confirmDelete.id
                  setConfirmDelete(null)
                  onDelete(id)
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
