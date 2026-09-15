/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImageAssetManager } from '@/rendering/ImageAssetManager'

// jsdom's Image never fires load events on its own, so drive them manually.
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ''
  static instances: FakeImage[] = []
  constructor() { FakeImage.instances.push(this) }
  get src() { return this._src }
  set src(v: string) { this._src = v }
  fireLoad() { this.onload?.() }
  fireError() { this.onerror?.() }
}

beforeEach(() => {
  FakeImage.instances = []
  vi.stubGlobal('Image', FakeImage)
})

describe('ImageAssetManager', () => {
  it('resolves once the image loads', async () => {
    const mgr = new ImageAssetManager((n) => `/fake/${n}.webp`)
    const pending = mgr.load('pickup_key')
    FakeImage.instances[0]!.fireLoad()
    await expect(pending).resolves.toBeDefined()
    expect(mgr.get('pickup_key')).toBeDefined()
  })

  it('serves a cached image without creating a second request', async () => {
    const mgr = new ImageAssetManager((n) => `/fake/${n}.webp`)
    const first = mgr.load('pickup_key')
    FakeImage.instances[0]!.fireLoad()
    await first
    await mgr.load('pickup_key')
    expect(FakeImage.instances.length).toBe(1)
  })

  it('shares one request between concurrent callers', async () => {
    const mgr = new ImageAssetManager((n) => `/fake/${n}.webp`)
    const a = mgr.load('pickup_coin')
    const b = mgr.load('pickup_coin')
    expect(FakeImage.instances.length).toBe(1)
    FakeImage.instances[0]!.fireLoad()
    expect(await a).toBe(await b)
  })

  it('rejects rather than hanging when an image fails', async () => {
    // A hung promise would leave the game on a loading screen with no explanation.
    const mgr = new ImageAssetManager((n) => `/fake/${n}.webp`)
    const pending = mgr.load('missing_asset')
    FakeImage.instances[0]!.fireError()
    await expect(pending).rejects.toThrow(/missing_asset/)
  })

  it('rejects an unknown name without touching the network', async () => {
    const mgr = new ImageAssetManager(() => undefined)
    await expect(mgr.load('nope')).rejects.toThrow(/nope/)
    expect(FakeImage.instances.length).toBe(0)
  })

  it('preload resolves when every image has loaded', async () => {
    const mgr = new ImageAssetManager((n) => `/fake/${n}.webp`)
    const done = mgr.preload(['a', 'b'])
    FakeImage.instances.forEach((i) => i.fireLoad())
    await expect(done).resolves.toBeUndefined()
  })
})
