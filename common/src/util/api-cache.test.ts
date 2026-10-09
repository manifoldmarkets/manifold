import { unauthedApi } from './api'

it('separates fresh quote URLs from cached display URLs and bypasses the fetch cache', async () => {
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      async () =>
        new Response('[]', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    )
  try {
    await unauthedApi('bets', {
      contractId: 'market',
      kinds: 'open-limit',
      fresh: true,
    })
    await unauthedApi('bets', { contractId: 'market', kinds: 'open-limit' })
    await unauthedApi('markets-by-ids', { ids: ['market'], fresh: true })
    await unauthedApi('users/by-id/balance', { ids: ['maker'], fresh: true })
    await unauthedApi('bets', { contractId: 'market', fresh: true })

    const requests = fetch.mock.calls.map(
      ([request]) => request as Pick<Request, 'url' | 'cache'>
    )
    const freshUrl = new URL(requests[0].url)
    const displayUrl = new URL(requests[1].url)
    expect(freshUrl.searchParams.get('fresh')).toBe('true')
    expect(displayUrl.searchParams.has('fresh')).toBe(false)
    expect(requests[0].cache).toBe('no-store')
    expect(requests[1].cache).not.toBe('no-store')
    expect(requests[2].cache).toBe('no-store')
    expect(requests[3].cache).toBe('no-store')
    // Bet history doesn't lose its cache merely because fresh was supplied.
    expect(requests[4].cache).not.toBe('no-store')
  } finally {
    fetch.mockRestore()
  }
})
