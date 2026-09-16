import type { ReactNode } from 'react'
import { assetUrl } from '../../rendering/assetManifest'

/**
 * The parchment panel shared by the trivia and message dialogs, so the two read as the same
 * voice.
 *
 * The tile is seamless and vignette-free (see tools/make_ui_assets.py), so a plain CSS
 * `background-repeat` tiles it invisibly — the Kotlin version needed a BitmapShader only because
 * Compose has no tiling ContentScale and an Image drew a single square in the middle of the panel.
 *
 * The corner ornaments are one asset drawn at four rotations. The art tapers to nothing away from
 * its corner, so rotating it produces a matched set without needing four drawables — and because
 * these sit only in the corners, the panel can be any size without anything stretching or tiling
 * along its edges.
 */
export const Parchment = ({
  className,
  children,
}: {
  readonly className?: string
  readonly children: ReactNode
}) => (
  <div
    className={`parchment${className ? ` ${className}` : ''}`}
    style={{ backgroundImage: `url(${assetUrl('ui_panel_tile') ?? ''})` }}
  >
    {[0, 90, 180, 270].map((deg) => (
      <img
        key={deg}
        className={`flourish flourish-${deg}`}
        src={assetUrl('ui_corner_flourish') ?? ''}
        alt=""
      />
    ))}
    <div className="parchment-content">{children}</div>
  </div>
)

/**
 * A wooden plaque used as a button.
 *
 * Shared between an answer and a "Continue" so the two read as the same object. The art is a
 * 9-patch, whose stretchable region CSS reproduces with `border-image`: only the plain middle
 * stretches, and the iron end-bands keep their proportions whatever the label's length.
 *
 * The slice values in styles.css are read off the asset's own marker border (stretch region
 * x 103..537, y 85..216 in a 642x303 image), so they describe the art rather than being guessed
 * — the same reason RoomGeometry derives its door boundaries instead of hardcoding them. The
 * marker border itself is one transparent pixel and falls inside the slice, which is invisible
 * at this size. Android read those markers natively; the browser cannot, so they are transcribed.
 */
export const PlaqueButton = ({
  label,
  onClick,
  className,
}: {
  readonly label: string
  readonly onClick: () => void
  readonly className?: string
}) => (
  <button
    type="button"
    className={`plaque${className ? ` ${className}` : ''}`}
    style={{ borderImageSource: `url(${assetUrl('ui_answer_plate.9') ?? ''})` }}
    onClick={onClick}
  >
    {label}
  </button>
)
