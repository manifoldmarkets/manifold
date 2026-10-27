import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Contract } from 'common/contract'
import { MarketLinkRef } from 'common/market-links'
import {
  createLinkedMarketHref,
  linkedRaceParents,
  mergeLinkedChildren,
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

test("a race's own market and its candidate market are its link parents", () => {
  const party = contract('party')
  const candidate = contract('candidate')
  assert.deepEqual(
    linkedRaceParents({ contract: party }, candidate).map((c) => c.id),
    ['party', 'candidate']
  )
  assert.deepEqual(
    linkedRaceParents({ contract: party }, null).map((c) => c.id),
    ['party']
  )
  assert.deepEqual(
    linkedRaceParents({ contract: undefined }, candidate).map((c) => c.id),
    ['candidate']
  )
  // The same market as both source and candidate counts once.
  assert.deepEqual(
    linkedRaceParents({ contract: party }, party).map((c) => c.id),
    ['party']
  )
})

test('a district priced by a shared portfolio answer has no parent of its own', () => {
  const portfolio = contract('portfolio')
  assert.deepEqual(
    linkedRaceParents({ contract: portfolio, answerId: 'ny-17' }, null),
    []
  )
  // A candidate market still counts: it is the district's own market.
  assert.deepEqual(
    linkedRaceParents(
      { contract: portfolio, answerId: 'ca-12' },
      contract('joyce')
    ).map((c) => c.id),
    ['joyce']
  )
  assert.deepEqual(linkedRaceParents({}, undefined), [])
})

test('children merge once each, lines then props then related, open only', () => {
  const merged = mergeLinkedChildren(
    [
      [
        ref('newest', 'related'),
        ref('margin', 'line'),
        ref('done', 'prop', true),
      ],
      [ref('turnout', 'prop'), ref('margin', 'line'), ref('newest', 'related')],
    ],
    ['party', 'candidate']
  )
  assert.deepEqual(
    merged.map((r) => r.id),
    ['margin', 'turnout', 'newest']
  )
})

test('a parent is never listed as a child', () => {
  // The candidate market linked under the party market keeps its own section.
  const merged = mergeLinkedChildren(
    [[ref('candidate', 'related'), ref('prop', 'prop')], undefined],
    ['party', 'candidate']
  )
  assert.deepEqual(
    merged.map((r) => r.id),
    ['prop']
  )
  assert.deepEqual(mergeLinkedChildren([undefined, undefined], ['party']), [])
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
