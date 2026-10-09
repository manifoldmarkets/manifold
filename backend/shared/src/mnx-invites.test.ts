import { API, ValidatedAPIParams } from 'common/api/schema'
import { MNX_INSTRUMENTS } from 'common/perps/mnx'
import { MNX_LINK_LOCATIONS } from 'common/perps/mnx-cta'
import { getMnxInvite } from './mnx-invites'
import { getUser } from './utils'

jest.mock('./utils', () => ({ getUser: jest.fn() }))

const { getMnxInviteLink } = jest.requireActual(
  '../../api/src/get-mnx-invite-link'
) as {
  getMnxInviteLink: (
    props: ValidatedAPIParams<'get-mnx-invite-link'>,
    auth: { uid: string }
  ) => Promise<{ url: string }>
}

// Vectors independently generated with Python hashlib, using UTF-8 and hex
// digests for both stages (the inner digest is not the raw 16 bytes).
it.each([
  ['Alice', 'd54992bbbb2e77158f474821f396e372'],
  ['alice', '12b5d2cbfdda5bb50f80a9438ee87ce5'],
  ['a+b &雪', '5cdf54ab0c52493c296c73a4b9259add'],
])('matches the MNX protocol for %s', (username, token) => {
  expect(getMnxInvite(username, 'test-api-secret')).toEqual({ username, token })
})

it('refuses an empty secret and changes the token on secret rotation', () => {
  expect(() => getMnxInvite('Alice', '')).toThrow('API_SECRET')
  expect(getMnxInvite('Alice', 'rotated-secret').token).not.toBe(
    getMnxInvite('Alice', 'test-api-secret').token
  )
})

describe('get-mnx-invite-link', () => {
  const originalSecret = process.env.API_SECRET
  const props = {
    feedId: MNX_INSTRUMENTS[0].feedId,
    location: MNX_LINK_LOCATIONS[0],
  }
  beforeEach(() => {
    process.env.API_SECRET = 'test-api-secret'
    jest.mocked(getUser).mockReset()
    jest
      .mocked(getUser)
      .mockResolvedValue({ username: 'Alice' } as Awaited<
        ReturnType<typeof getUser>
      >)
  })
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.API_SECRET
    else process.env.API_SECRET = originalSecret
  })

  it('requires auth, disables caching, and rejects caller-supplied identities', () => {
    const endpoint = API['get-mnx-invite-link']
    expect(endpoint.authed).toBe(true)
    expect(endpoint.cache).toBe('private, no-store')
    for (const extra of [
      { username: 'Bob' },
      { userId: 'bob' },
      { url: 'https://evil.example' },
    ])
      expect(endpoint.props.safeParse({ ...props, ...extra }).success).toBe(
        false
      )
  })

  it('signs the authenticated user for every instrument and placement', async () => {
    for (const instrument of MNX_INSTRUMENTS) {
      for (const location of MNX_LINK_LOCATIONS) {
        const result = await getMnxInviteLink(
          { feedId: instrument.feedId, location },
          { uid: 'alice-id' }
        )
        const url = new URL(result.url)
        expect(url.origin + url.pathname).toBe(instrument.url)
        expect(url.searchParams.get('u')).toBe('Alice')
        expect(url.searchParams.get('t')).toBe(
          'd54992bbbb2e77158f474821f396e372'
        )
        expect(url.searchParams.get('utm_content')).toBe(
          location.replace(/ /g, '-')
        )
        expect(result.url).not.toContain('test-api-secret')
        expect(result.url).not.toContain('135cdade7d1422347e3f9a0475d52a8c')
      }
    }
    expect(getUser).toHaveBeenCalledWith('alice-id')
  })

  it('fails for an unknown instrument, missing user, or missing secret', async () => {
    await expect(
      getMnxInviteLink({ ...props, feedId: 'btc-usd' }, { uid: 'alice-id' })
    ).rejects.toMatchObject({ code: 400 })
    jest.mocked(getUser).mockResolvedValue(null)
    await expect(
      getMnxInviteLink(props, { uid: 'missing' })
    ).rejects.toMatchObject({ code: 404 })
    delete process.env.API_SECRET
    await expect(
      getMnxInviteLink(props, { uid: 'alice-id' })
    ).rejects.toMatchObject({ code: 503 })
  })
})
