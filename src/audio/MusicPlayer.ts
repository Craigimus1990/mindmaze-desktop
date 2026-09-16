import { MUSIC_URL } from '../rendering/assetManifest'

/**
 * Background music, gated on the player's musicEnabled setting.
 *
 * Chromium blocks autoplay until the page has had a user gesture, so play() is called from the
 * first click rather than at load: starting it any earlier fails silently and the music never
 * begins. Looped, because the track is a couple of minutes and a game runs longer.
 *
 * The Android original also negotiated audio focus — ducking for navigation prompts, pausing for
 * calls — because it ran on a tablet in a moving car alongside a stereo. A desktop Electron window
 * has no equivalent focus API and no competing in-car audio to yield to, so that layer has no
 * counterpart here; the OS mixer is the volume control instead. Volume 0.4 keeps it under
 * gameplay rather than in front of it, matching the Kotlin player's deliberately low level.
 */
export class MusicPlayer {
  private audio: HTMLAudioElement | null = null
  private enabled = true

  setEnabled(on: boolean): void {
    this.enabled = on
    if (!on) this.stop()
  }

  isEnabled(): boolean {
    return this.enabled
  }

  /** Safe to call on every click; it only starts playback once. */
  start(): void {
    if (!this.enabled || this.audio) return
    const audio = new Audio(MUSIC_URL)
    audio.loop = true
    audio.volume = 0.4
    // A rejected play() is normal when no gesture has landed yet — try again on the next click.
    void audio.play().catch(() => {
      this.audio = null
    })
    this.audio = audio
  }

  stop(): void {
    this.audio?.pause()
    this.audio = null
  }
}
