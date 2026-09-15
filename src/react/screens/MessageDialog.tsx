import type { UiState } from '../../ui/UiState'
import { Parchment, PlaqueButton } from './Parchment'

/**
 * A modal story message: a locked door, a windlass turning, the portcullis rising.
 *
 * Shares the trivia dialog's parchment, corner flourishes and wooden plaque so the two read as
 * the same voice. A toast was the obvious alternative and is wrong for this: these messages tell
 * the player what the rest of the maze is *for*, and a toast that fades after two seconds is no
 * way to deliver "go and find the key".
 */
export const MessageDialog = ({
  state,
  onDismiss,
}: {
  readonly state: Extract<UiState, { type: 'Message' }>
  readonly onDismiss: () => void
}) => (
  <div className="dialog-scrim">
    <Parchment className="message-dialog">
      <h2 className="message-title">{state.title}</h2>
      {/* The reducer writes these bodies with a blank line in them; preserve it rather than
          collapsing the paragraphs into one block. */}
      <p className="message-body">{state.body}</p>
      <PlaqueButton label="Continue" onClick={onDismiss} />
    </Parchment>
  </div>
)
