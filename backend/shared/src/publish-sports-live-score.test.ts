jest.mock('shared/utils', () => ({
  __esModule: true,
  get LOCAL_DEV() {
    return false
  },
  log: { error: jest.fn() },
}))

import { publishSportsLiveScore } from './publish-sports-live-score'
import * as utils from 'shared/utils'

const score = {
  sportsHomeScore: 7,
  sportsAwayScore: 0,
  sportsLiveStatus: 'IN_PLAY',
  sportsLiveMinute: null,
  sportsLiveUpdatedTime: 100,
}
const previousSecret = process.env.API_SECRET

afterEach(() => {
  if (previousSecret === undefined) delete process.env.API_SECRET
  else process.env.API_SECRET = previousSecret
  jest.restoreAllMocks()
})

it('sends the committed score through the API writer endpoint', async () => {
  process.env.API_SECRET = 'test-secret'
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{}'))
  await publishSportsLiveScore('game', score)
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/internal-sports-broadcast'),
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        apiSecret: 'test-secret',
        contractId: 'game',
        score,
      }),
    })
  )
})

it('contains a network failure so resolution and other games can proceed', async () => {
  process.env.API_SECRET = 'test-secret'
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unreachable'))
  await expect(publishSportsLiveScore('game', score)).resolves.toBeUndefined()
})

it('never contacts a deployed API from a local scheduler', async () => {
  process.env.API_SECRET = 'test-secret'
  jest.spyOn(utils, 'LOCAL_DEV', 'get').mockReturnValue(true)
  const fetch = jest.spyOn(globalThis, 'fetch')
  await publishSportsLiveScore('game', score)
  expect(fetch).not.toHaveBeenCalled()
})
