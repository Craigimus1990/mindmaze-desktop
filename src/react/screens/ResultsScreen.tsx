import type { ScoreBreakdown } from '../../engine/engine/ScoreCalculator'
import { assetUrl } from '../../rendering/assetManifest'
import { floorMod } from '../../rendering/hash'

/**
 * Backdrops for the victory screen, rotated so a replay does not always land on the same one.
 *
 * All three are drawn to the same brief: treasure in the upper portion, calm floor across the
 * bottom third where the score panel sits. Swapping one for art without that calm band would
 * put the score text over busy detail.
 */
const TREASURE_BACKDROPS: readonly string[] = [
  'results_treasure_vault',
  'results_treasure_pedestal',
  'results_treasure_dragon_hoard',
]

export const ResultsScreen = ({
  breakdown,
  onBackToMenu,
}: {
  readonly breakdown: ScoreBreakdown
  readonly onBackToMenu: () => void
}) => {
  // Keyed on the score rather than random so the screen does not swap backdrops under the
  // player if it re-renders while they are reading it.
  const backdrop = TREASURE_BACKDROPS[floorMod(breakdown.total, TREASURE_BACKDROPS.length)]!

  return (
    <div
      className="results-screen"
      // Cover, matching MenuScreen: the art is 16:9 and real panes run narrower, so fitting
      // would letterbox. The treasure sits centre-frame and survives the crop.
      style={{ backgroundImage: `url(${assetUrl(backdrop) ?? ''})` }}
    >
      {/* The score is light-on-art. Lightest at the top so the treasure stays bright and
          readable as the reward, strongest at the bottom where the numbers actually sit. */}
      <div className="results-scrim" />
      {/* Bottom-anchored: the art's subject is up top, so the panel drops into the calm band
          the backdrops deliberately leave clear. */}
      <div className="results-content">
        <h1 className="results-title">You found the treasure!</h1>
        <p className="results-line">{`Coins: ${breakdown.coinPoints}`}</p>
        <p className="results-line">{`Correct answers: ${breakdown.answerPoints}`}</p>
        <p className="results-line">{`Time bonus: ${breakdown.timeBonus}`}</p>
        {/* Gold, to tie the number to the pile behind it. */}
        <p className="results-total">{`Total: ${breakdown.total}`}</p>
        <button type="button" className="btn btn-primary" onClick={onBackToMenu}>
          Back to Menu
        </button>
      </div>
    </div>
  )
}
