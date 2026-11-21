import { VERIFIED_USERNAMES } from '../envs/constants'
import {
  DEFAULT_PERP_CREATOR_ACCOUNT,
  getAllowedPerpCreatorAccounts,
  isPerpCreatorAccountAllowed,
  MNX_CREATOR_USERNAME,
  PERP_CREATOR_ACCOUNT_LABELS,
  PERP_CREATOR_ACCOUNTS,
} from './creator-accounts'
import { MNX_INSTRUMENTS } from './mnx'

it('defaults to the official Manifold account and labels every option', () => {
  expect(DEFAULT_PERP_CREATOR_ACCOUNT).toBe('manifold')
  expect(PERP_CREATOR_ACCOUNTS[0]).toBe('manifold')
  for (const account of PERP_CREATOR_ACCOUNTS)
    expect(PERP_CREATOR_ACCOUNT_LABELS[account]).toMatch(/\S/)
})

it('lets MNX own markets on every MNX feed and nothing else', () => {
  for (const instrument of MNX_INSTRUMENTS) {
    expect(getAllowedPerpCreatorAccounts(instrument.feedId)).toEqual([
      'manifold',
      'mnx',
    ])
    expect(isPerpCreatorAccountAllowed('mnx', instrument.feedId)).toBe(true)
  }
  for (const feedId of ['btc-usd', 'spyx-usd', 'not-a-feed', undefined]) {
    expect(getAllowedPerpCreatorAccounts(feedId)).toEqual(['manifold'])
    expect(isPerpCreatorAccountAllowed('mnx', feedId)).toBe(false)
    expect(isPerpCreatorAccountAllowed('manifold', feedId)).toBe(true)
  }
})

it('resolves the partner by a verified username so the badge renders', () => {
  expect(VERIFIED_USERNAMES).toContain(MNX_CREATOR_USERNAME)
})
