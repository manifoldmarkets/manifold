import { Request, Response } from 'express'

import { unsubscribe } from 'api/unsubscribe'
import { PrivateUser } from 'common/user'
import { notification_preferences } from 'common/user-notification-preferences'
import { trackPublicEvent } from 'shared/analytics'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser } from 'shared/supabase/users'
import { getPrivateUser } from 'shared/utils'

jest.mock('shared/utils', () => ({ getPrivateUser: jest.fn() }))
jest.mock('shared/analytics', () => ({ trackPublicEvent: jest.fn() }))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/supabase/users', () => ({ updatePrivateUser: jest.fn() }))

const response = {
  status: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis(),
}
const invoke = (query: Request['query']) =>
  unsubscribe({ query } as Request, response as unknown as Response)

let user: PrivateUser
beforeEach(() => {
  jest.clearAllMocks()
  // Legacy users lack the new tagged_all_traders preference.
  const notificationPreferences: Partial<notification_preferences> = {
    tagged_user: ['browser', 'email', 'mobile'],
    opt_out_all: [],
  }
  user = {
    id: 'trader',
    email: 'trader@example.com',
    blockedUserIds: [],
    blockedByUserIds: [],
    blockedContractIds: [],
    blockedGroupSlugs: [],
    notificationPreferences:
      notificationPreferences as notification_preferences,
  }
  jest.mocked(getPrivateUser).mockResolvedValue(user)
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue({} as ReturnType<typeof createSupabaseDirectClient>)
})

it.each<{ name: string; type: Request['query']['type'] }>([
  { name: 'unknown key', type: 'unknown_preference' },
  { name: 'prototype method', type: 'toString' },
  { name: 'constructor', type: 'constructor' },
  { name: 'prototype key', type: '__proto__' },
  { name: 'missing type', type: undefined },
  { name: 'empty type', type: '' },
  { name: 'array type', type: ['tagged_user'] },
  { name: 'object type', type: { value: 'tagged_user' } },
])('rejects $name before any lookup or mutation', async ({ type }) => {
  await invoke({ id: user.id, type })
  expect(response.status).toHaveBeenCalledWith(400)
  expect(response.send).toHaveBeenCalledTimes(1)
  expect(getPrivateUser).not.toHaveBeenCalled()
  expect(trackPublicEvent).not.toHaveBeenCalled()
  expect(createSupabaseDirectClient).not.toHaveBeenCalled()
  expect(updatePrivateUser).not.toHaveBeenCalled()
})

it.each<{ id: Request['query']['id'] }>([
  { id: undefined },
  { id: '' },
  { id: ['trader'] },
  { id: { value: 'trader' } },
])('rejects an invalid id before any lookup', async ({ id }) => {
  await invoke({ id, type: 'tagged_user' })
  expect(response.status).toHaveBeenCalledWith(400)
  expect(getPrivateUser).not.toHaveBeenCalled()
  expect(trackPublicEvent).not.toHaveBeenCalled()
  expect(updatePrivateUser).not.toHaveBeenCalled()
})

it('removes email from a valid saved preference without changing other channels', async () => {
  user.notificationPreferences.tagged_all_traders = ['browser', 'email']
  await invoke({ id: user.id, type: 'tagged_user' })
  expect(updatePrivateUser).toHaveBeenCalledWith(expect.anything(), user.id, {
    notificationPreferences: {
      tagged_user: ['browser', 'mobile'],
      tagged_all_traders: ['browser', 'email'],
      opt_out_all: [],
    },
  })
  expect(trackPublicEvent).toHaveBeenCalledWith(
    user.id,
    'unsubscribe from emails',
    {
      type: 'tagged_user',
    }
  )
  expect(response.status).not.toHaveBeenCalled()
  expect(response.send).toHaveBeenCalledTimes(1)
})

it('materializes an inherited traders preference without changing direct tags', async () => {
  await invoke({ id: user.id, type: 'tagged_all_traders' })
  expect(updatePrivateUser).toHaveBeenCalledWith(expect.anything(), user.id, {
    notificationPreferences: {
      tagged_user: ['browser', 'email', 'mobile'],
      tagged_all_traders: ['browser', 'mobile'],
      opt_out_all: [],
    },
  })
  expect(user.notificationPreferences.tagged_user).toEqual([
    'browser',
    'email',
    'mobile',
  ])
  expect(user.notificationPreferences.tagged_all_traders).toBeUndefined()
  expect(response.status).not.toHaveBeenCalled()
})

it('adds the global email opt-out without changing existing opt-outs', async () => {
  user.notificationPreferences.opt_out_all = ['mobile']
  await invoke({ id: user.id, type: 'opt_out_all' })
  expect(updatePrivateUser).toHaveBeenCalledWith(expect.anything(), user.id, {
    notificationPreferences: {
      tagged_user: ['browser', 'email', 'mobile'],
      opt_out_all: ['mobile', 'email'],
    },
  })
  expect(user.notificationPreferences.opt_out_all).toEqual(['mobile'])
  expect(response.status).not.toHaveBeenCalled()
})
