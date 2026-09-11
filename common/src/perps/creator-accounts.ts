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

// The partner account is resolved by username at request time because its id
// differs per environment (and DEV may not have one at all). The name is in
// VERIFIED_USERNAMES, so the badge shows on markets it owns.
export const MNX_CREATOR_USERNAME = 'MNX'

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
