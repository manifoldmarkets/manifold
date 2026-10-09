import assert from 'node:assert/strict'
import { test } from 'node:test'
import { referralQuery } from 'common/util/share'
import { buildShareUrl } from './share-url'

const domain = 'manifold.markets'

test('a plain page with no referral is just the page', () => {
  assert.equal(
    buildShareUrl({ domain, pathname: '/election', search: '' }),
    'https://manifold.markets/election'
  )
})

test('deep-link parameters are kept, in order', () => {
  assert.equal(
    buildShareUrl({
      domain,
      pathname: '/election',
      search: '?office=senate&race=ME',
    }),
    'https://manifold.markets/election?office=senate&race=ME'
  )
})

test("a signed-in sharer's referral is added after the deep link", () => {
  const url = buildShareUrl({
    domain,
    pathname: '/election',
    search: '?office=house&race=NY-14',
    referralQuery: referralQuery('Jack1'),
  })
  const parsed = new URL(url)
  assert.equal(parsed.pathname, '/election')
  assert.equal(parsed.searchParams.get('office'), 'house')
  assert.equal(parsed.searchParams.get('race'), 'NY-14')
  assert.equal(
    Buffer.from(parsed.searchParams.get('r') as string, 'base64').toString(),
    'Jack1'
  )
})

test("someone else's referral and campaign tags are not passed on", () => {
  assert.equal(
    buildShareUrl({
      domain,
      pathname: '/election',
      search:
        '?r=b3RoZXI&referrer=other&utm_source=x&utm_campaign=launch&fbclid=abc&race=ME&office=senate',
    }),
    'https://manifold.markets/election?race=ME&office=senate'
  )
})

test("the sharer's referral replaces an incoming one", () => {
  const url = buildShareUrl({
    domain,
    pathname: '/election',
    search: '?r=b3RoZXI',
    referralQuery: referralQuery('Tod'),
  })
  const r = new URL(url).searchParams.getAll('r')
  assert.equal(r.length, 1)
  assert.equal(Buffer.from(r[0], 'base64').toString(), 'Tod')
})

test('a referral value with + or / reads back intact', () => {
  // referralQuery's value is unencoded base64. Usernames' alphabet never
  // produces + or /, but the helper must not mangle them if it ever does.
  const url = buildShareUrl({
    domain,
    pathname: '/election',
    search: '',
    referralQuery: '?r=Pj8+/w',
  })
  assert.equal(new URL(url).searchParams.get('r'), 'Pj8+/w')
})

test('the referrer= fallback form is kept as is', () => {
  assert.equal(
    buildShareUrl({
      domain,
      pathname: '/election',
      search: '?race=ME&office=senate',
      referralQuery: '?referrer=Jack1',
    }),
    'https://manifold.markets/election?race=ME&office=senate&referrer=Jack1'
  )
})
