import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Contract } from 'common/contract'
import { MarketLinkRef } from 'common/market-links'
import {
  createLinkedMarketHref,
  linkedRaceParent,
  openLinkedChildren,
} from './race-linked-markets-model'

const contract = (id: string, closeTime = 1_800_000_000_000) =>
  ({ id, closeTime } as Contract)

const ref = (
  id: string,
  relation: MarketLinkRef['relation'],
  isResolved = false
): MarketLinkRef => ({
  id,
  question: `Q ${id}`,
  slug: `${id}-slug`,
  creatorId: 'owner',
  creatorUsername: 'owner',
  relation,
  closeTime: null,
  isResolved,
})

test("a race's own market is its link parent", () => {
  assert.equal(linkedRaceParent({ contract: contract('party') })?.id, 'party')
  assert.equal(linkedRaceParent({ contract: undefined }), undefined)
  assert.equal(linkedRaceParent({}), undefined)
})

test('a district priced by a shared portfolio answer has no parent of its own', () => {
  assert.equal(
    linkedRaceParent({ contract: contract('portfolio'), answerId: 'ny-17' }),
    undefined
  )
})

test('children list once each, lines then props then related, open only', () => {
  const open = openLinkedChildren(
    [
      ref('newest', 'related'),
      ref('margin', 'line'),
      ref('done', 'prop', true),
      ref('turnout', 'prop'),
      ref('margin', 'line'),
    ],
    'party'
  )
  assert.deepEqual(
    open.map((r) => r.id),
    ['margin', 'turnout', 'newest']
  )
})

test('the parent is never listed under itself', () => {
  assert.deepEqual(
    openLinkedChildren(
      [ref('party', 'related'), ref('prop', 'prop')],
      'party'
    ).map((r) => r.id),
    ['prop']
  )
  assert.deepEqual(openLinkedChildren([], 'party'), [])
})

test('the create link prefills a market linked to the race with its deadline', () => {
  const href = createLinkedMarketHref(
    { label: 'Texas Senate' },
    contract('txsenate123', 1_793_000_000_000)
  )
  const params = JSON.parse(
    decodeURIComponent(href.replace('/create?params=', ''))
  )
  assert.equal(params.q, 'Texas Senate 2026: ')
  assert.equal(params.linkedToContractId, 'txsenate123')
  assert.equal(params.linkRelation, 'prop')
  assert.equal(params.closeTime, 1_793_000_000_000)
  assert.deepEqual(params.groupSlugs, ['2026-midterms'])
  assert.equal(params.visibility, 'public')
  assert.equal(params.rand, 'txsena')
})
