import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SPORTS_SCHEDULE_PAGE_SIZE } from 'common/sports-game-feed'
import { loadSportsOgMarket } from './sports-og'

test('loads the initial schedule without related markets, with a bounded request', async () => {
  const result = await loadSportsOgMarket(async (input, options) => {
    const url = new URL(String(input))
    assert.equal(url.pathname, '/sports-schedule')
    assert.equal(url.searchParams.get('sport'), 'all')
    assert.equal(
      url.searchParams.get('limit'),
      String(SPORTS_SCHEDULE_PAGE_SIZE)
    )
    assert.equal(url.searchParams.get('includeRelated'), 'false')
    assert.ok(options?.signal instanceof AbortSignal)
    assert.equal(options.cache, 'no-store')
    return Response.json({ snapshotTime: Date.now(), games: [] })
  })
  assert.equal(result, null)
})

test('returns an artwork fallback when the schedule errors, times out, or is malformed', async (context) => {
  context.mock.method(console, 'warn', () => {})
  for (const fetcher of [
    async () => new Response('', { status: 503 }),
    async () => {
      throw new DOMException('Timed out', 'AbortError')
    },
    async () => new Response('not JSON'),
  ]) {
    assert.equal(await loadSportsOgMarket(fetcher), null)
  }
})
