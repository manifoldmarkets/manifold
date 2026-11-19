import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getCreateMarketCloseParams } from 'web/components/new-contract/utils/linked-market-state'
import {
  validateContractForm,
  type ContractFormState,
} from './contract-validation'

const state = {
  question: 'Will the event happen?',
  outcomeType: 'BINARY',
  answers: [],
  closeDate: '2026-11-09',
  neverCloses: false,
  visibility: 'public',
  liquidityTier: 100,
} satisfies ContractFormState

test('closing time validation agrees with the timestamp submitted to the API', () => {
  const originalNow = Date.now
  const now = new Date(2026, 10, 9, 12).getTime()
  Date.now = () => now
  try {
    for (const [closeHoursMinutes, expectedTime, expectedValid] of [
      ['10:00', '10:00', false],
      ['12:00', '12:00', false],
      ['13:00', '13:00', true],
      [undefined, '23:59', true],
      ['', '23:59', true],
    ] as const) {
      const form = { ...state, closeHoursMinutes }
      const { closeTime } = getCreateMarketCloseParams(form)
      assert.ok(closeTime !== undefined)
      assert.equal(
        new Date(closeTime).toTimeString().slice(0, 5),
        expectedTime
      )
      assert.equal(closeTime > now, expectedValid)
      const validation = validateContractForm(form)
      assert.equal(validation.isValid, expectedValid, String(closeHoursMinutes))
      assert.equal(
        validation.errors.closeDate,
        expectedValid ? undefined : 'Close date must be in the future'
      )
    }
  } finally {
    Date.now = originalNow
  }
})

test('invalid closing dates and times are rejected before submission', () => {
  for (const fields of [
    { closeDate: 'invalid' },
    { closeHoursMinutes: '25:00' },
  ]) {
    const form = { ...state, ...fields }
    assert.throws(() => getCreateMarketCloseParams(form), /valid close date and time/)
    assert.ok(validateContractForm(form).errors.closeDate)
  }
})

test('a never-closing poll needs no closing timestamp', () => {
  const form = {
    ...state,
    outcomeType: 'POLL' as const,
    answers: ['Yes', 'No'],
    closeDate: undefined,
    neverCloses: true,
  }
  assert.deepEqual(getCreateMarketCloseParams(form), { neverCloses: true })
  assert.equal(validateContractForm(form).isValid, true)
})
