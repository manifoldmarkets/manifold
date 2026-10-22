import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MarketDraft } from 'common/drafts'
import { API } from 'common/api/schema'
import type { Contract } from 'common/contract'
import { validateContractForm } from 'web/lib/validation/contract-validation'
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
  shouldApplyLinkedMarketCloseTime,
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

test('duplicate URL closeTime zero means no supplied date for polls and native no-close types', () => {
  for (const outcomeType of ['POLL', 'STONK', 'BOUNTIED_QUESTION'] as const) {
    const params = JSON.parse('{"closeTime":0}') as { closeTime: number }
    const duplicated = {
      ...state,
      outcomeType,
      ...getCloseTimeFields(params.closeTime),
    }
    assert.equal(duplicated.closeDate, undefined)
    assert.deepEqual(getCreateMarketCloseParams(duplicated), {})
  }
})

test('inherited server drafts survive API validation and restore without a pending deadline', () => {
  const inherited = applyLinkedMarketCloseTime(
    { ...state, linkedToContractId: 'game' },
    { id: 'game', closeTime }
  )
  const saved = API['save-market-draft'].props.parse({
    data: {
      ...draft,
      ...inherited,
      savedAt: closeTime,
    },
  }).data
  assert.equal(saved.visibility, 'public')
  const restored = restoreMarketDraft(state, {
    ...saved,
    visibility: 'public',
    answers: saved.answers ?? [],
  })
  assert.equal(restored.inheritedCloseTimeFrom, 'game')
  assert.equal(isLinkedCloseTimePending(restored), false)
  assert.deepEqual(getCreateMarketCloseParams(restored), {})
})

test('native no-close types never preview an inherited deadline or wait for one', () => {
  for (const outcomeType of ['STONK', 'BOUNTIED_QUESTION'] as const) {
    const linked = { ...state, outcomeType, linkedToContractId: 'game' }
    assert.equal(isLinkedCloseTimePending(linked), false)
    assert.equal(
      shouldApplyLinkedMarketCloseTime(linked, { id: 'game', closeTime }),
      false
    )
    assert.equal(getLinkedCloseTimeDescription(linked), 'Never')
    const inherited = applyLinkedMarketCloseTime(linked, {
      id: 'game',
      closeTime,
    })
    assert.equal(inherited.closeDate, undefined)
    assert.deepEqual(getCreateMarketCloseParams(inherited), {})
    const stale = {
      ...linked,
      ...getCloseTimeFields(closeTime),
      inheritedCloseTimeFrom: 'game',
    }
    assert.equal(getLinkedCloseTimeDescription(stale), 'Never')
    const manual = { ...stale, hasManuallyEditedCloseDate: true }
    assert.equal(getLinkedCloseTimeDescription(manual), undefined)
    assert.deepEqual(getCreateMarketCloseParams(manual), { closeTime })
  }
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
  assert.equal(
    shouldApplyLinkedMarketCloseTime(linked, { id: 'game', closeTime }),
    false
  )
  assert.strictEqual(
    applyLinkedMarketCloseTime(linked, { id: 'game', closeTime }),
    linked
  )
})

// Use the same pure decision as LinkedMarketField's effect. Server rendering
// does not run effects, so renderToStaticMarkup cannot exercise this lifecycle.
function loadParentDefault(
  state: FormState,
  parent: Pick<Contract, 'id' | 'closeTime'>
) {
  return shouldApplyLinkedMarketCloseTime(state, parent)
    ? applyLinkedMarketCloseTime(state, parent)
    : state
}

const day = 24 * 60 * 60 * 1000
const today = new Date().setHours(12, 0, 0, 0)
const movedParent = { id: 'game', closeTime: today + 5 * day }

for (const source of ['server draft', 'local persisted state'] as const) {
  for (const oldDate of ['future', 'past'] as const) {
    test(`RR-01: ${source} refreshes an inherited ${oldDate} deadline from the current cached parent`, () => {
      const oldDeadline = today + (oldDate === 'past' ? -2 : 2) * day
      const savedState = applyLinkedMarketCloseTime(
        selectLinkedMarket(state, { contractId: 'game', relation: 'prop' }),
        { id: 'game', closeTime: oldDeadline }
      )
      // The parent is already cached and has supplied NEW before OLD is restored.
      const current = loadParentDefault(
        { ...state, linkedToContractId: 'game' },
        movedParent
      )
      let restored: FormState
      if (source === 'server draft') {
        const data = API['save-market-draft'].props.parse({
          data: {
            ...draft,
            ...savedState,
            savedAt: today,
          },
        }).data
        assert.equal(data.visibility, 'public')
        restored = restoreMarketDraft(current, {
          ...data,
          visibility: 'public',
          answers: data.answers ?? [],
        })
      } else {
        // usePersistentLocalState restores this JSON without changing provenance.
        restored = JSON.parse(JSON.stringify(savedState)) as FormState
      }
      assert.equal(isLinkedCloseTimePending(restored), false)
      if (oldDate === 'past') {
        assert.equal(
          validateContractForm({ ...restored, outcomeType: 'BINARY' }).errors
            .closeDate,
          'Close date must be in the future'
        )
      }
      const refreshed = loadParentDefault(restored, movedParent)
      assert.equal(
        refreshed.closeDate,
        getCloseTimeFields(movedParent.closeTime)?.closeDate
      )
      assert.equal(
        refreshed.closeHoursMinutes,
        getCloseTimeFields(movedParent.closeTime)?.closeHoursMinutes
      )
      assert.equal(refreshed.inheritedCloseTimeFrom, 'game')
      assert.equal(refreshed.hasManuallyEditedCloseDate, false)
      assert.equal(
        shouldApplyLinkedMarketCloseTime(refreshed, movedParent),
        false
      )
      assert.strictEqual(loadParentDefault(refreshed, movedParent), refreshed)
      assert.deepEqual(getCreateMarketCloseParams(refreshed), {})
      assert.equal(
        validateContractForm({ ...refreshed, outcomeType: 'BINARY' }).errors
          .closeDate,
        undefined
      )
    })
  }
}

test('RR-01: a moved parent preserves manual dates and the poll Never override', () => {
  const manualDeadline = today + 3 * day
  const manual = {
    ...state,
    linkedToContractId: 'game',
    ...getCloseTimeFields(manualDeadline),
    hasManuallyEditedCloseDate: true,
  }
  assert.strictEqual(loadParentDefault(manual, movedParent), manual)
  assert.deepEqual(getCreateMarketCloseParams(manual), {
    closeTime: manualDeadline,
  })
  const never = { ...manual, outcomeType: 'POLL' as const, neverCloses: true }
  assert.strictEqual(loadParentDefault(never, movedParent), never)
  assert.deepEqual(getCreateMarketCloseParams(never), { neverCloses: true })
})

test('RR-01: resetting a cached parent still reapplies its default', () => {
  const loaded = loadParentDefault(
    { ...state, linkedToContractId: 'game' },
    movedParent
  )
  assert.equal(isLinkedCloseTimePending(loaded), false)
  const reset = { ...state, linkedToContractId: 'game' }
  assert.equal(isLinkedCloseTimePending(reset), true)
  assert.deepEqual(loadParentDefault(reset, movedParent), loaded)
})

test('pending AI suggestions are discarded after linking, editing the time, or changing the question', () => {
  const updatedStates: FormState[] = [
    { ...state, linkedToContractId: 'game' },
    { ...state, hasManuallyEditedCloseDate: true },
    { ...state, question: 'A newer question?' },
    { ...state, outcomeType: 'POLL' },
    { ...state, outcomeType: 'STONK' },
    { ...state, outcomeType: 'BOUNTIED_QUESTION' },
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
