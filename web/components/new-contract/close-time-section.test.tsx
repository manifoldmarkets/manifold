import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { CloseTimeSection } from './close-time-section'

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
