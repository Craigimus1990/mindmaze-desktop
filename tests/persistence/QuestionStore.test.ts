import { describe, it, expect, beforeEach } from 'vitest'
import { QuestionStore } from '@/persistence/QuestionStore'
import { QuestionBank } from '@/persistence/QuestionBank'
import type { MindMazeBridge } from '@/types/window'

/**
 * Ported informally from Kotlin's QuestionStore usage in CustomQuestionMergeTest (that suite
 * exercises QuestionBank.merge directly; QuestionStore itself has no dedicated Kotlin test file,
 * but is exercised here since this port backs it with the bridge's custom_questions.json slot
 * instead of SharedPreferences).
 */
const fakeBridge = (): MindMazeBridge => {
  const files = new Map<string, string>()
  return {
    loadActive: async () => null,
    saveActive: async () => {},
    clearActive: async () => {},
    loadSaved: async () => null,
    saveSaved: async () => {},
    clearSaved: async () => {},
    loadSettings: async () => null,
    saveSettings: async () => {},
    loadCustomQuestions: async () => files.get('custom_questions.json') ?? null,
    saveCustomQuestions: async (json) => void files.set('custom_questions.json', json),
  }
}

const entry = (id: string, question = 'Q?'): QuestionBank.Entry => ({
  id,
  topic: 'MATH',
  difficulty: 'KINDERGARTEN',
  question,
  answers: ['a', 'b', 'c', 'd'],
  correctIndex: 0,
})

describe('QuestionStore', () => {
  let store: QuestionStore

  beforeEach(() => {
    store = new QuestionStore(fakeBridge())
  })

  it('customJson defaults to an empty array', async () => {
    expect(await store.customJson()).toBe('[]')
  })

  it('custom defaults to an empty list', async () => {
    expect(await store.custom()).toEqual([])
  })

  it('hidden defaults to an empty set', async () => {
    expect(await store.hidden()).toEqual(new Set())
  })

  it('saveCustom persists entries', async () => {
    await store.saveCustom([entry('c1'), entry('c2')])
    const back = await store.custom()
    expect(back.map((e) => e.id)).toEqual(['c1', 'c2'])
  })

  it('hide adds an id to the hidden set', async () => {
    await store.hide('b1')
    expect(await store.hidden()).toEqual(new Set(['b1']))
  })

  it('hide is additive across calls', async () => {
    await store.hide('b1')
    await store.hide('b2')
    expect(await store.hidden()).toEqual(new Set(['b1', 'b2']))
  })

  it('unhide removes an id from the hidden set', async () => {
    await store.hide('b1')
    await store.hide('b2')
    await store.unhide('b1')
    expect(await store.hidden()).toEqual(new Set(['b2']))
  })

  it('mergedJson folds bundled, custom, and hidden together', async () => {
    const bundled = QuestionBank.toJson([entry('b1'), entry('b2')])
    await store.saveCustom([entry('c1')])
    await store.hide('b1')
    const merged = await store.mergedJson(bundled)
    const ids = QuestionBank.parse(merged).map((e) => e.id)
    expect(ids.sort()).toEqual(['b2', 'c1'])
  })
})
