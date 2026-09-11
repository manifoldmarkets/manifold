import {
  MNX_CREATOR_USERNAME,
  getMnxCreatorId,
  PERP_CREATOR_ACCOUNT_LABELS,
  PerpCreatorAccount,
} from 'common/perps/creator-accounts'
import { convertUser } from 'common/supabase/users'
import { User } from 'common/user'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { getPerpLaunchCreatorId } from './launch-manifest'

type Environment = 'DEV' | 'PROD'

// Kept as re-exports for scripts and preflight consumers.
export { MNX_CREATOR_IDS, getMnxCreatorId } from 'common/perps/creator-accounts'

export type PerpCreatorAccountResolution =
  | { account: PerpCreatorAccount; user: User; reason?: undefined }
  | { account: PerpCreatorAccount; user: null; reason: string }

// Maps a creator-account choice to the user row that will pay the backing and
// own the market. Plain queries (no shared/utils) so scripts and the preflight
// can call this with a bare client. Both accounts are pinned by id per
// environment; nothing here trusts a username.
export const resolvePerpCreatorAccount = async (
  account: PerpCreatorAccount,
  environment: Environment,
  pg: SupabaseDirectClient
): Promise<PerpCreatorAccountResolution> => {
  const label = PERP_CREATOR_ACCOUNT_LABELS[account]
  const id =
    account === 'manifold'
      ? getPerpLaunchCreatorId(environment)
      : getMnxCreatorId(environment)
  if (!id)
    return {
      account,
      user: null,
      reason: `no ${label} account id is configured for ${environment} (MNX_CREATOR_IDS in backend/shared/src/perps/creator-accounts.ts)`,
    }
  const user = await pg.oneOrNone(
    `select * from users where id = $1 limit 1`,
    [id],
    convertUser
  )
  if (!user)
    return {
      account,
      user: null,
      reason: `${label} account ${id} does not exist in ${environment}`,
    }
  // A deleted or banned owner cannot be paid the residual or trusted with the
  // badge; refuse rather than create a market nobody can settle to.
  if (user.userDeleted || user.isBannedFromPosting)
    return {
      account,
      user: null,
      reason: `${label} (@${user.username}, ${id}) is ${
        user.userDeleted ? 'deleted' : 'banned'
      }`,
    }
  return { account, user }
}

// Creation moves money to and from the pinned account, so an id that no
// longer carries the partner's name is refused until someone confirms it is
// still the right account. Read-only paths (the preflight) trust the id alone,
// so a rename never invalidates markets the partner already owns.
export const getPerpCreatorAccountMismatch = (
  resolution: PerpCreatorAccountResolution
) =>
  resolution.user &&
  resolution.account === 'mnx' &&
  resolution.user.username !== MNX_CREATOR_USERNAME
    ? `configured MNX partner account ${resolution.user.id} is now @${resolution.user.username}, not @${MNX_CREATOR_USERNAME}; confirm MNX_CREATOR_IDS before creating`
    : null
