import { randomUUID } from 'node:crypto'
import { Request } from 'express'
import { APIError } from 'common/api/utils'
import { ValidatedAPIParams } from 'common/api/schema'

jest.mock('api/helpers/rate-limit', () => ({
  rateLimitByUser: (handler: unknown) => handler,
  onlyUsersWhoCanPerformAction:
    (action: string, handler: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      if (action === 'bet') throw new APIError(403, 'Trading banned')
      return handler(...args)
    },
}))
jest.mock('shared/poker/service', () => ({
  actPoker: jest.fn().mockResolvedValue({ success: true }),
}))
jest.mock('shared/supabase/init', () => ({}))

const { pokerAction } = jest.requireActual('../../../api/src/poker') as {
  pokerAction: (
    props: ValidatedAPIParams<'act-poker'>,
    auth: { uid: string },
    request: Request
  ) => Promise<unknown>
}
import { actPoker } from './service'

it('allows trading-banned players to sit out while blocking join and ready', async () => {
  const props = { tableId: randomUUID(), requestId: randomUUID(), version: 0 }
  const auth = { uid: 'banned' }
  const request = {} as Request
  await expect(
    pokerAction(
      { ...props, action: { type: 'ready', ready: false } },
      auth,
      request
    )
  ).resolves.toEqual({ success: true })
  expect(actPoker).toHaveBeenCalledTimes(1)
  await expect(
    pokerAction(
      { ...props, action: { type: 'ready', ready: true } },
      auth,
      request
    )
  ).rejects.toMatchObject({ code: 403 })
  await expect(
    pokerAction({ ...props, action: { type: 'join' } }, auth, request)
  ).rejects.toMatchObject({ code: 403 })
  expect(actPoker).toHaveBeenCalledTimes(1)
})
