import { Contract } from 'common/contract'
import { LiquidityProvision } from 'common/liquidity-provision'
import { PrivateUser } from 'common/user'
import { getDefaultNotificationPreferences } from 'common/user-notification-preferences'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import { getPrivateUser } from 'shared/utils'
import { createLiquidityReturnedNotifications } from './create-liquidity-returned-notifications'

jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/supabase/notifications', () => ({
  insertNotificationToSupabase: jest.fn(),
}))
jest.mock('shared/utils', () => ({ getPrivateUser: jest.fn() }))

it('records only opted-in other providers receiving at least one unit, with CASH context', async () => {
  const privateUser = {
    id: 'provider',
    notificationPreferences: getDefaultNotificationPreferences(),
  } as PrivateUser
  jest.mocked(getPrivateUser).mockImplementation(async (id) => {
    if (id === 'missing') return null
    return {
      ...privateUser,
      id,
      notificationPreferences: {
        ...privateUser.notificationPreferences,
        liquidity_returned: id === 'opted-out' ? [] : ['browser'],
      },
    }
  })
  const returned = [
    'caller',
    'below-threshold',
    'exact-threshold',
    'above-threshold',
    'opted-out',
    'missing',
  ].map(
    (userId): LiquidityProvision => ({
      id: userId,
      userId,
      contractId: 'market',
      createdTime: 0,
      amount:
        userId === 'below-threshold'
          ? -0.99
          : userId === 'exact-threshold'
          ? -1
          : -2,
      withdrawnBy: 'caller',
    })
  )
  await createLiquidityReturnedNotifications(
    {
      id: 'market',
      token: 'CASH',
      slug: 'market',
      question: 'Test market',
    } as Contract,
    { id: 'caller', name: 'Caller', username: 'caller', avatarUrl: '' },
    returned
  )
  expect(createSupabaseDirectClient).toHaveBeenCalledTimes(1)
  expect(jest.mocked(getPrivateUser).mock.calls.map(([id]) => id)).toEqual([
    'exact-threshold',
    'above-threshold',
    'opted-out',
    'missing',
  ])
  expect(insertNotificationToSupabase).toHaveBeenCalledTimes(2)
  for (const [index, amount] of ['1', '2'].entries()) {
    expect(
      jest.mocked(insertNotificationToSupabase).mock.calls[index][0]
    ).toMatchObject({
      id: `liquidity-returned-${
        index === 0 ? 'exact-threshold' : 'above-threshold'
      }`,
      userId: index === 0 ? 'exact-threshold' : 'above-threshold',
      reason: 'liquidity_returned',
      sourceId: 'caller',
      sourceContractId: 'market',
      sourceText: amount,
      data: { token: 'CASH' },
    })
  }
})
