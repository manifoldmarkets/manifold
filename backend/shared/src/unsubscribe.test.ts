import { Request, Response } from 'express'

import { unsubscribe } from 'api/unsubscribe'
import { PrivateUser } from 'common/user'
import { notification_preferences } from 'common/user-notification-preferences'
import { trackPublicEvent } from 'shared/analytics'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser } from 'shared/supabase/users'
import { getPrivateUser } from 'shared/utils'
import {
  getEmailNotificationDestinations,
  getUnsubscribeUrl,
  signUnsubscribe,
} from 'shared/unsubscribe-links'

jest.mock('shared/utils', () => ({ getPrivateUser: jest.fn() }))
jest.mock('shared/analytics', () => ({ trackPublicEvent: jest.fn() }))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/supabase/users', () => ({ updatePrivateUser: jest.fn() }))

const response = {
  status: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
}
const call = (method: string, query: Request['query']) =>
  unsubscribe({ method, query } as Request, response as unknown as Response)
// A signed one-click POST, as from the confirmation page.
const invoke = (query: Request['query']) =>
  call('POST', {
    ...query,
    sig:
      typeof query.id === 'string' && typeof query.type === 'string'
        ? signUnsubscribe(query.id, query.type)
        : undefined,
  })
const sent = () => String(response.send.mock.calls[0]?.[0] ?? '')

let user: PrivateUser
beforeEach(() => {
  jest.clearAllMocks()
  process.env.UNSUBSCRIBE_SIGNING_KEY = 'test-signing-key'
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

describe('signed links', () => {
  const expectNoChange = () => {
    expect(getPrivateUser).not.toHaveBeenCalled()
    expect(trackPublicEvent).not.toHaveBeenCalled()
    expect(updatePrivateUser).not.toHaveBeenCalled()
  }

  it.each<{ name: string; sig: Request['query']['sig'] }>([
    { name: 'a missing signature (legacy link)', sig: undefined },
    { name: 'an empty signature', sig: '' },
    {
      name: 'a wrong signature',
      sig: 'v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    },
    { name: "another type's signature", sig: 'other-type' },
    { name: "another user's signature", sig: 'other-user' },
    { name: 'an array signature', sig: ['x'] },
  ])('changes nothing for $name', async ({ sig }) => {
    const signature =
      sig === 'other-type'
        ? signUnsubscribe(user.id, 'opt_out_all')
        : sig === 'other-user'
        ? signUnsubscribe('someone-else', 'tagged_user')
        : sig
    for (const method of ['GET', 'POST']) {
      jest.clearAllMocks()
      await call(method, { id: user.id, type: 'tagged_user', sig: signature })
      expectNoChange()
      expect(sent()).toContain(
        '/notifications?tab=settings&amp;section=tagged_user'
      )
      expect(sent()).not.toContain(user.email!)
    }
  })

  it('only asks for confirmation on GET', async () => {
    const sig = signUnsubscribe(user.id, 'tagged_user')
    await call('GET', { id: user.id, type: 'tagged_user', sig })
    expectNoChange()
    expect(sent()).toContain('<form method="post"')
    expect(sent()).toContain(`sig=${sig}`)
  })

  it('changes nothing when no signing key is configured', async () => {
    const sig = signUnsubscribe(user.id, 'tagged_user')
    delete process.env.UNSUBSCRIBE_SIGNING_KEY
    await call('POST', { id: user.id, type: 'tagged_user', sig })
    expectNoChange()
  })

  it('never shows the email address', async () => {
    for (const type of ['tagged_user', 'opt_out_all']) {
      jest.clearAllMocks()
      await invoke({ id: user.id, type })
      expect(updatePrivateUser).toHaveBeenCalledTimes(1)
      expect(sent()).not.toContain(user.email!)
    }
  })

  it('offers a signed opt-out-all link after a single unsubscribe', async () => {
    await invoke({ id: user.id, type: 'tagged_user' })
    expect(sent()).toContain(
      `sig=${encodeURIComponent(signUnsubscribe(user.id, 'opt_out_all')!)}`
    )
  })

  it('builds email links that verify for that user and type only', async () => {
    const url = new URL(getUnsubscribeUrl(user.id, 'tagged_user'))
    expect(url.searchParams.get('id')).toBe(user.id)
    expect(url.searchParams.get('type')).toBe('tagged_user')
    await call('POST', Object.fromEntries(url.searchParams))
    expect(updatePrivateUser).toHaveBeenCalledTimes(1)

    const { unsubscribeUrl } = getEmailNotificationDestinations(
      user,
      'tagged_user'
    )
    expect(new URL(unsubscribeUrl).searchParams.get('sig')).toBe(
      signUnsubscribe(user.id, 'tagged_user')
    )
  })

  it('links to notification settings when no signing key is configured', () => {
    delete process.env.UNSUBSCRIBE_SIGNING_KEY
    expect(getUnsubscribeUrl(user.id, 'tagged_user')).toMatch(
      /\/notifications\?tab=settings&section=tagged_user$/
    )
  })
})
