import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FIREBASE_CONFIG } from 'common/envs/constants'
import { SportsOgMarket } from 'common/sports-og'
import { loadSportsOgLogos } from './sports-og-logos'

const LOGO = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_CONFIG.storageBucket}/o/user-images%2FManifoldSports%2Fteam.png?alt=media`
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
  'base64'
)
const market: SportsOgMarket = {
  id: 'game',
  question: 'A vs B',
  league: 'NFL',
  outcomes: [
    { name: 'A', prob: 0.5, imageUrl: LOGO },
    { name: 'B', prob: 0.5 },
  ],
  asOf: Date.now(),
}

test('embeds supported team uploads and does not follow redirects', async () => {
  const logos = await loadSportsOgLogos(market, async (url, options) => {
    assert.equal(url, LOGO)
    assert.equal(options?.redirect, 'error')
    assert.ok(options?.signal)
    return new Response(PNG, { headers: { 'content-type': 'image/png' } })
  })
  assert.deepEqual(logos, [
    `data:image/png;base64,${PNG.toString('base64')}`,
    undefined,
  ])
})

test('leaves colour badges when logos fail, are unsupported, malformed or too large', async () => {
  for (const fetcher of [
    async () => {
      throw new Error('Unavailable')
    },
    async () => new Response('', { status: 404 }),
    async () =>
      new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
    async () =>
      new Response('not a PNG', { headers: { 'content-type': 'image/png' } }),
    async () =>
      new Response(PNG, {
        headers: { 'content-type': 'image/png', 'content-length': '600000' },
      }),
    async () =>
      new Response(new Uint8Array(600000), {
        headers: { 'content-type': 'image/png' },
      }),
  ])
    assert.deepEqual(await loadSportsOgLogos(market, fetcher), [
      undefined,
      undefined,
    ])
})

test('does not fetch missing or untrusted image URLs', async () => {
  const fetcher: typeof fetch = async () => {
    throw new Error('Should not fetch')
  }
  assert.deepEqual(await loadSportsOgLogos(null, fetcher), [])
  const untrusted = {
    ...market,
    outcomes: [
      { ...market.outcomes[0], imageUrl: 'http://localhost/logo.png' },
      market.outcomes[1],
    ],
  }
  let requests = 0
  await loadSportsOgLogos(untrusted, async () => {
    requests++
    return new Response()
  })
  assert.equal(requests, 0)
})

test('aborts a stalled logo request and keeps the badge', async () => {
  const logos = await loadSportsOgLogos(
    market,
    async (_url, options) =>
      new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        )
      })
  )
  assert.deepEqual(logos, [undefined, undefined])
})
