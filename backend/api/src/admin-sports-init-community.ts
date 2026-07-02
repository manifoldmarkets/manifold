import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { TOURNAMENT_CONFIGS, ensureCommunityAssets } from 'shared/sports-markets'
import { getUser } from 'shared/utils'
import { ENV } from 'common/envs/constants'

export const adminSportsInitCommunity: APIHandler<
  'admin-sports-init-community'
> = async (props, auth) => {
  throwErrorIfNotAdmin(auth.uid)

  const { competitionCode } = props
  const config = TOURNAMENT_CONFIGS[competitionCode]
  if (!config) throw new APIError(400, `Unknown competition code: ${competitionCode}`)

  const pg = createSupabaseDirectClient()
  const creatorId =
    ENV === 'DEV'
      ? config.manifoldSportsUserId.dev
      : config.manifoldSportsUserId.prod

  const creatorUser = await getUser(creatorId)
  if (!creatorUser)
    throw new APIError(500, `ManifoldSports user ${creatorId} not found`)

  return ensureCommunityAssets(
    config,
    creatorId,
    creatorUser.username,
    creatorUser.name,
    creatorUser.avatarUrl ?? '',
    pg
  )
}
