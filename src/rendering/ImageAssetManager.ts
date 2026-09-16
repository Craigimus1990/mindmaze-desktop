import { assetUrl } from './assetManifest'

/**
 * Loads and caches drawables.
 *
 * The Android original decoded resources synchronously and needed no cache of its own. The web
 * loads images asynchronously, and a room drawn before its backdrop has arrived flashes empty,
 * so this resolves a promise before first paint and holds decoded images for reuse.
 *
 * The resolver is injectable so tests need neither the bundler nor the network.
 */
export class ImageAssetManager {
  private readonly cache = new Map<string, HTMLImageElement>()
  private readonly inFlight = new Map<string, Promise<HTMLImageElement>>()

  constructor(private readonly resolve: (name: string) => string | undefined = assetUrl) {}

  get(name: string): HTMLImageElement | undefined {
    return this.cache.get(name)
  }

  load(name: string): Promise<HTMLImageElement> {
    const cached = this.cache.get(name)
    if (cached) return Promise.resolve(cached)

    const existing = this.inFlight.get(name)
    if (existing) return existing

    const url = this.resolve(name)
    if (!url) {
      return Promise.reject(new Error(`No such drawable: ${name}`))
    }

    const pending = new Promise<HTMLImageElement>((resolvePromise, reject) => {
      const img = new Image()
      img.onload = () => {
        this.cache.set(name, img)
        this.inFlight.delete(name)
        resolvePromise(img)
      }
      img.onerror = () => {
        this.inFlight.delete(name)
        // Reject rather than hang: a pending promise would strand the game on a loading screen.
        reject(new Error(`Failed to load drawable: ${name}`))
      }
      img.src = url
    })

    this.inFlight.set(name, pending)
    return pending
  }

  async preload(names: readonly string[]): Promise<void> {
    await Promise.all(names.map((n) => this.load(n)))
  }
}
