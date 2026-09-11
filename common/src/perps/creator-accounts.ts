import { getMnxInstrument } from './mnx'

// Accounts a PERP can be created under. The selection is the market's creator
// in every sense the engine knows: it pays the backing at creation and
// receives the residual pool at settlement (PERP_RESOLVE_RESIDUAL is paid to
// contract.creatorId). Personal admin accounts are deliberately not on the
// list — see PERP_LAUNCH_CREATOR_IDS for why the house account is the default.
export const PERP_CREATOR_ACCOUNTS = ['manifold', 'mnx'] as const
export type PerpCreatorAccount = (typeof PERP_CREATOR_ACCOUNTS)[number]

export const DEFAULT_PERP_CREATOR_ACCOUNT: PerpCreatorAccount = 'manifold'

export const PERP_CREATOR_ACCOUNT_LABELS: Record<PerpCreatorAccount, string> = {
  manifold: 'Manifold (official account)',
  mnx: 'MNX',
}

// Display name only; authorization uses the immutable per-environment id.
export const MNX_CREATOR_USERNAME = 'MNX'

// The partner is identified by user id, never by username: usernames can be
// changed and are not reserved, so resolving @MNX at request time would let a
// rename strand its existing markets and let whoever reclaims the old name
// become the partner. Fill an environment in from
//   select id, username from users where username = 'MNX'
// and leave it undefined to keep MNX unavailable there (the form greys the
// option out and create-perp refuses it).
export const MNX_CREATOR_IDS: Record<'DEV' | 'PROD', string | undefined> = {
  DEV: undefined,
  PROD: '0YOMCbJas0UqJdlrqKe1MrQewrF2',
}

export const getMnxCreatorId = (environment: 'DEV' | 'PROD') =>
  MNX_CREATOR_IDS[environment]

// A partner may only own markets on its own feeds: MNX-owned BTC markets would
// route house backing to a third party for a product it has nothing to do
// with. The official account may own anything.
export const getAllowedPerpCreatorAccounts = (
  feedId: string | undefined
): readonly PerpCreatorAccount[] =>
  getMnxInstrument(feedId) ? PERP_CREATOR_ACCOUNTS : ['manifold']

export const isPerpCreatorAccountAllowed = (
  account: PerpCreatorAccount,
  feedId: string | undefined
) => getAllowedPerpCreatorAccounts(feedId).includes(account)
