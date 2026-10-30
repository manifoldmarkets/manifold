import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { CloseTimeSection } from './close-time-section'
import type { FormState } from './contextual-editor-panel'
import {
  getCreateMarketCloseParams,
  isLinkedCloseTimePending,
  selectLinkedMarket,
} from './utils/linked-market-state'

const props = {
  closeDate: undefined,
  closeHoursMinutes: undefined,
  neverCloses: false,
  outcomeType: 'POLL' as const,
  submitState: 'EDITING' as const,
  initTime: '23:59',
  setCloseDate: () => undefined,
  setCloseHoursMinutes: () => undefined,
  setNeverCloses: () => undefined,
}

const neverOption = (html: string) => {
  const option = html
    .match(/<div[^>]*role="radio"[^>]*>[\s\S]*?<\/div>/g)
    ?.find((s) => s.includes('>Never<'))
  assert.ok(option, 'Poll must offer an explicit Never choice')
  return option
}

test('a linked poll awaiting its parent does not display Never as selected', () => {
  const html = renderToStaticMarkup(
    <CloseTimeSection {...props} inheritedCloseTimePending />
  )
  assert.match(neverOption(html), /aria-checked="false"/)
  assert.match(html, /Loading the linked market/)
})

test('a loaded parent deadline is displayed without selecting Never', () => {
  const html = renderToStaticMarkup(
    <CloseTimeSection {...props} closeDate="2026-11-01" />
  )
  assert.match(neverOption(html), /aria-checked="false"/)
  assert.match(html, /value="2026-11-01"/)
})

test('an explicit Never choice remains selected', () => {
  const html = renderToStaticMarkup(<CloseTimeSection {...props} neverCloses />)
  assert.match(neverOption(html), /aria-checked="true"/)
})

test('an ordinary market never offers the poll Never choice while awaiting a parent', () => {
  const html = renderToStaticMarkup(
    <CloseTimeSection
      {...props}
      outcomeType="BINARY"
      inheritedCloseTimePending
    />
  )
  assert.doesNotMatch(html, />Never</)
  assert.match(html, /type="date"/)
})

test('a linked poll edited without a date shows Never and sends Never', () => {
  const poll: FormState = {
    question: 'Who is the player of the game?',
    outcomeType: 'POLL',
    answers: ['A', 'B'],
    neverCloses: false,
    hasManuallyEditedCloseDate: false,
    selectedGroups: [],
    visibility: 'public',
    liquidityTier: 100,
  }
  const pending = selectLinkedMarket(poll, {
    contractId: 'game',
    relation: 'related',
  })
  // A time typed before the parent's deadline loads is a manual edit, so the
  // deadline no longer loads in and the date stays empty.
  for (const edited of [
    {
      ...pending,
      closeHoursMinutes: '10:00',
      hasManuallyEditedCloseDate: true,
    },
    { ...pending, closeDate: '', hasManuallyEditedCloseDate: true },
  ]) {
    const html = renderToStaticMarkup(
      <CloseTimeSection
        {...props}
        inheritedCloseTimePending={isLinkedCloseTimePending(edited)}
        closeDate={edited.closeDate}
        closeHoursMinutes={edited.closeHoursMinutes}
        neverCloses={edited.neverCloses}
      />
    )
    assert.match(neverOption(html), /aria-checked="true"/)
    assert.deepEqual(getCreateMarketCloseParams(edited), { neverCloses: true })
  }
})
