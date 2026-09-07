jest.mock('shared/websockets/helpers', () => ({
  broadcastSportsLiveScore: jest.fn(),
}))

import { broadcastSportsLiveScore } from 'shared/websockets/helpers'
import { internalSportsBroadcast } from './internal-sports-broadcast'

const send = internalSportsBroadcast as (
  body: Parameters<typeof internalSportsBroadcast>[0]
) => ReturnType<typeof internalSportsBroadcast>
const score = {
  sportsHomeScore: 7,
  sportsAwayScore: 0,
  sportsLiveStatus: 'IN_PLAY' as const,
  sportsLiveMinute: null,
  sportsLiveUpdatedTime: 100,
}
const previousSecret = process.env.API_SECRET

afterEach(() => {
  if (previousSecret === undefined) delete process.env.API_SECRET
  else process.env.API_SECRET = previousSecret
  jest.clearAllMocks()
})

it('rejects missing and incorrect service credentials without broadcasting', async () => {
  delete process.env.API_SECRET
  await expect(
    send({ apiSecret: 'test', contractId: 'game', score })
  ).rejects.toMatchObject({ code: 500 })
  process.env.API_SECRET = 'test-secret'
  await expect(
    send({ apiSecret: 'wrong', contractId: 'game', score })
  ).rejects.toMatchObject({ code: 403 })
  expect(broadcastSportsLiveScore).not.toHaveBeenCalled()
})

it('delivers an authenticated scheduler score to the API switchboard', async () => {
  process.env.API_SECRET = 'test-secret'
  await expect(
    send({ apiSecret: 'test-secret', contractId: 'game', score })
  ).resolves.toEqual({ success: true })
  expect(broadcastSportsLiveScore).toHaveBeenCalledWith('game', score)
})
