import {
  MNX_CREATOR_USERNAME,
  PERP_CREATOR_ACCOUNT_LABELS,
  PerpCreatorAccount,
} from 'common/perps/creator-accounts'
import { convertUser } from 'common/supabase/users'
import { User } from 'common/user'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { getPerpLaunchCreatorId } from './launch-manifest'

export type PerpCreatorAccountResolution =
  | { account: PerpCreatorAccount; user: User; reason?: undefined }
  | { account: PerpCreatorAccount; user: null; reason: string }

// Maps a creator-account choice to the user row that will pay the backing and
// own the market. Plain queries (no shared/utils) so scripts and the preflight
// can call this with a bare client. The official account is pinned by id per
// environment; the partner is looked up by username because its id is not.
export const resolvePerpCreatorAccount = async (
  account: PerpCreatorAccount,
  environment: 'DEV' | 'PROD',
  pg: SupabaseDirectClient
): Promise<PerpCreatorAccountResolution> => {
  const label = PERP_CREATOR_ACCOUNT_LABELS[account]
  const user =
    account === 'manifold'
      ? await pg.oneOrNone(
          `select * from users where id = $1 limit 1`,
          [getPerpLaunchCreatorId(environment)],
          convertUser
        )
      : await pg.oneOrNone(
          `select * from users where username = $1 limit 1`,
          [MNX_CREATOR_USERNAME],
          convertUser
        )
  if (!user)
    return {
      account,
      user: null,
      reason:
        account === 'manifold'
          ? `the official ${environment} Manifold account ${getPerpLaunchCreatorId(
              environment
            )} does not exist`
          : `no @${MNX_CREATOR_USERNAME} account exists in ${environment}`,
    }
  // A deleted or banned owner cannot be paid the residual or trusted with the
  // badge; refuse rather than create a market nobody can settle to.
  if (user.userDeleted || user.isBannedFromPosting)
    return {
      account,
      user: null,
      reason: `${label} (@${user.username}) is ${
        user.userDeleted ? 'deleted' : 'banned'
      }`,
    }
  return { account, user }
}
