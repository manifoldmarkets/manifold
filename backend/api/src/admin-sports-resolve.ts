import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import {
  TOURNAMENT_CONFIGS,
  resolveTournamentMarkets,
} from 'shared/sports-markets'

export const adminSportsResolve: APIHandler<'admin-sports-resolve'> = async (
  props,
  auth
) => {
  throwErrorIfNotAdmin(auth.uid)

  const apiKey = process.env.FOOTBALL_DATA_API_KEY ?? ''
  if (!apiKey) throw new APIError(500, 'FOOTBALL_DATA_API_KEY not set on server')

  const { competitionCode } = props

  const config = TOURNAMENT_CONFIGS[competitionCode]
  if (!config) throw new APIError(400, `Unknown competition code: ${competitionCode}`)

  const { resolved, skipped, errors, log } = await resolveTournamentMarkets(
    config,
    apiKey
  )

  return { resolved, skipped, errors, log }
}
