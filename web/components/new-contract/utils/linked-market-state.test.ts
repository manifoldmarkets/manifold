import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MarketDraft } from 'common/drafts'
import type { FormState } from '../contextual-editor-panel'
import {
  applyLinkedMarketCloseTime,
  applySuggestedCloseTime,
  getCloseTimeFields,
  getCreateMarketCloseParams,
  restoreMarketDraft,
  selectLinkedMarket,
  getLinkedCloseTimeDescription,
  isLinkedCloseTimePending,
} from './linked-market-state'

const closeTime = new Date(2026, 9, 15, 0, 15).getTime()
const state: FormState = {
  question: 'Will the team score at least three goals?',
  outcomeType: 'BINARY',
  answers: [],
  neverCloses: false,
  hasManuallyEditedCloseDate: false,
  selectedGroups: [],
  visibility: 'public',
  liquidityTier: 100,
}

const draft: MarketDraft['data'] = {
  question: 'A different saved question?',
  outcomeType: 'BINARY',
  answers: [],
  visibility: 'public',
  selectedGroups: [],
  savedAt: closeTime,
}

test('a Never poll sends an explicit override without its previous inherited deadline', () => {
  assert.deepEqual(
    getCreateMarketCloseParams({
      ...state,
      outcomeType: 'POLL',
      neverCloses: true,
      closeDate: '2026-10-15',
      closeHoursMinutes: '00:15',
    }),
    { neverCloses: true }
  )
})

test('restoring a linked Never poll preserves the override through parent loading and submission', () => {
  const loaded = restoreMarketDraft(state, {
    ...draft,
    outcomeType: 'POLL',
    linkedToContractId: 'game',
    linkRelation: 'related',
    neverCloses: true,
    hasManuallyEditedCloseDate: true,
  })
  const inherited = applyLinkedMarketCloseTime(loaded, {
    id: 'game',
    closeTime,
  })
  assert.strictEqual(inherited, loaded)
  assert.deepEqual(getCreateMarketCloseParams(inherited), { neverCloses: true })
})

test('normal and dated-poll payloads omit Never, including stale flags from another type', () => {
  for (const outcomeType of ['BINARY', 'POLL'] as const) {
    assert.deepEqual(getCreateMarketCloseParams({ ...state, outcomeType }), {})
    assert.deepEqual(
      getCreateMarketCloseParams({
        ...state,
        outcomeType,
        closeDate: '2026-10-15',
        closeHoursMinutes: '00:15',
      }),
      { closeTime }
    )
  }
  assert.deepEqual(
    getCreateMarketCloseParams({ ...state, neverCloses: true }),
    {}
  )
  assert.deepEqual(
    getCreateMarketCloseParams({
      ...state,
      neverCloses: true,
      closeDate: '2026-10-15',
      closeHoursMinutes: '00:15',
    }),
    { closeTime }
  )
})

test('invalid dates fail before constructing a non-finite API deadline', () => {
  assert.throws(
    () => getCreateMarketCloseParams({ ...state, closeDate: 'invalid-date' }),
    /valid close date and time/
  )
})

test('URL/parent close times retain the local date and minute, including after midnight', () => {
  assert.deepEqual(getCloseTimeFields(closeTime), {
    closeDate: '2026-10-15',
    closeHoursMinutes: '00:15',
    neverCloses: false,
  })
  for (const invalid of [undefined, NaN, Infinity, -Infinity, 1e20])
    assert.equal(getCloseTimeFields(invalid), undefined)
})

test('a linked draft takes its parent time until the creator explicitly changes it', () => {
  const linked = { ...state, linkedToContractId: 'game' }
  const inherited = applyLinkedMarketCloseTime(linked, {
    id: 'game',
    closeTime,
  })
  assert.equal(inherited.closeDate, '2026-10-15')
  assert.equal(inherited.closeHoursMinutes, '00:15')
  assert.deepEqual(getCreateMarketCloseParams(inherited), {})
  const manuallyChanged = {
    ...inherited,
    closeHoursMinutes: '01:30',
    hasManuallyEditedCloseDate: true,
  }
  const reloaded: FormState = JSON.parse(JSON.stringify(manuallyChanged))
  assert.strictEqual(
    applyLinkedMarketCloseTime(reloaded, { id: 'game', closeTime }),
    reloaded
  )
})

test('switching or removing a parent clears an inherited deadline and its provenance', () => {
  const inherited = applyLinkedMarketCloseTime(
    { ...state, linkedToContractId: 'a' },
    { id: 'a', closeTime }
  )
  assert.equal(inherited.inheritedCloseTimeFrom, 'a')
  for (const link of [
    undefined,
    { contractId: 'b', relation: 'related' as const },
  ]) {
    const next = selectLinkedMarket(inherited, link)
    assert.equal(next.closeDate, undefined)
    assert.equal(next.inheritedCloseTimeFrom, undefined)
    assert.deepEqual(getCreateMarketCloseParams(next), {})
  }
  const changed = selectLinkedMarket(inherited, {
    contractId: 'b',
    relation: 'related',
  })
  const noDeadline = applyLinkedMarketCloseTime(changed, { id: 'b' })
  assert.equal(noDeadline.closeDate, undefined)
  assert.equal(noDeadline.inheritedCloseTimeFrom, 'b')
  assert.deepEqual(getCreateMarketCloseParams(noDeadline), {})
  assert.strictEqual(
    applyLinkedMarketCloseTime(noDeadline, { id: 'a', closeTime }),
    noDeadline
  )
})

test('manual dates and explicit Never survive switching/removing parents', () => {
  const inherited = applyLinkedMarketCloseTime(
    { ...state, linkedToContractId: 'a' },
    { id: 'a', closeTime }
  )
  const manual = { ...inherited, hasManuallyEditedCloseDate: true }
  for (const link of [
    undefined,
    { contractId: 'b', relation: 'prop' as const },
  ]) {
    assert.deepEqual(
      getCreateMarketCloseParams(selectLinkedMarket(manual, link)),
      { closeTime }
    )
    assert.deepEqual(
      getCreateMarketCloseParams(
        selectLinkedMarket(
          { ...manual, outcomeType: 'POLL', neverCloses: true },
          link
        )
      ),
      { neverCloses: true }
    )
  }
})

test('a linked poll shows pending parent timing, not Never, until loaded', () => {
  const poll = {
    ...state,
    outcomeType: 'POLL' as const,
    linkedToContractId: 'a',
  }
  assert.match(getLinkedCloseTimeDescription(poll)!, /loading/)
  assert.equal(isLinkedCloseTimePending(poll), true)
  assert.deepEqual(getCreateMarketCloseParams(poll), {})
  const loaded = applyLinkedMarketCloseTime(poll, { id: 'a', closeTime })
  assert.equal(getLinkedCloseTimeDescription(loaded), undefined)
  assert.equal(isLinkedCloseTimePending(loaded), false)
  assert.equal(loaded.closeDate, '2026-10-15')
  assert.deepEqual(getCreateMarketCloseParams(loaded), {})
  assert.equal(
    getLinkedCloseTimeDescription(
      applyLinkedMarketCloseTime(poll, { id: 'a' })
    ),
    'Never'
  )
})

test('restoring an inherited draft keeps its date a default while manual edits remain overrides', () => {
  const loaded = restoreMarketDraft(state, {
    ...draft,
    linkedToContractId: 'a',
    inheritedCloseTimeFrom: 'a',
    closeDate: '2026-10-15',
    closeHoursMinutes: '00:15',
    hasManuallyEditedCloseDate: false,
  })
  assert.deepEqual(getCreateMarketCloseParams(loaded), {})
  assert.equal(selectLinkedMarket(loaded, undefined).closeDate, undefined)
})

test('a delayed parent response cannot overwrite a newly selected parent', () => {
  const linked = { ...state, linkedToContractId: 'other-game' }
  assert.strictEqual(
    applyLinkedMarketCloseTime(linked, { id: 'game', closeTime }),
    linked
  )
})

test('pending AI suggestions are discarded after linking, editing the time, or changing the question', () => {
  const updatedStates: FormState[] = [
    { ...state, linkedToContractId: 'game' },
    { ...state, hasManuallyEditedCloseDate: true },
    { ...state, question: 'A newer question?' },
    { ...state, outcomeType: 'POLL' },
  ]
  for (const updated of updatedStates)
    assert.strictEqual(
      applySuggestedCloseTime(updated, state.question, closeTime),
      updated
    )
  assert.equal(
    applySuggestedCloseTime(state, state.question, closeTime).closeHoursMinutes,
    '00:15'
  )
})

test('loading an older unlinked draft clears a previous parent and Never override', () => {
  const loaded = restoreMarketDraft(
    {
      ...state,
      linkedToContractId: 'game',
      linkRelation: 'prop',
      neverCloses: true,
      hasManuallyEditedCloseDate: true,
    },
    draft
  )
  assert.equal(loaded.linkedToContractId, undefined)
  assert.equal(loaded.linkRelation, undefined)
  assert.equal(loaded.neverCloses, false)
  assert.equal(loaded.hasManuallyEditedCloseDate, false)
})

test('loading a linked saved draft restores its parent, relation and explicit close override', () => {
  const loaded = restoreMarketDraft(state, {
    ...draft,
    linkedToContractId: 'game',
    linkRelation: 'line',
    closeDate: '2026-10-20',
    closeHoursMinutes: '01:30',
    hasManuallyEditedCloseDate: true,
  })
  assert.equal(loaded.linkedToContractId, 'game')
  assert.equal(loaded.linkRelation, 'line')
  assert.strictEqual(
    applyLinkedMarketCloseTime(loaded, { id: 'game', closeTime }),
    loaded
  )
})

test('older stored dates without an intent flag are preserved when linking', () => {
  const loaded = restoreMarketDraft(state, {
    ...draft,
    closeDate: '2026-10-20',
    closeHoursMinutes: '10:30',
  })
  const linked = { ...loaded, linkedToContractId: 'game' }
  assert.strictEqual(
    applyLinkedMarketCloseTime(linked, { id: 'game', closeTime }),
    linked
  )
})
