import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { calendarEntriesFor } from 'common/sports-calendar'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { runMajorCreation } from 'shared/bdl/create-major-markets'
import {
  creationSettings,
  saveCreationSetting,
} from 'shared/bdl/major-settings'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isProd } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'

function requireSportsOperator(uid: string) {
  throwErrorIfNotAdmin(uid)
  if (!isSportsBdlEnabled()) throw new APIError(404, 'Sports BDL disabled')
}

export const adminSportsCreationSettings: APIHandler<
  'admin-sports-creation-settings'
> = async (_props, auth) => {
  requireSportsOperator(auth.uid)
  return { settings: await creationSettings(createSupabaseDirectClient()) }
}

export const adminSetSportsCreationBudget: APIHandler<
  'admin-sports-set-creation-budget'
> = async (props, auth) => {
  requireSportsOperator(auth.uid)
  const row =
    'league' in props
      ? {
          scope: props.league,
          cap: props.cap,
          baseAnte: props.baseAnte,
          startsOn: props.startsOn,
          groupSlugs: [...new Set(props.groupSlugs)],
        }
      : { ...props, baseAnte: null, startsOn: null, groupSlugs: null }
  await saveCreationSetting(createSupabaseDirectClient(), row, auth.uid)
  return { saved: true }
}

export const adminCreateBdlMarkets: APIHandler<
  'admin-sports-create-bdl-markets'
> = async (props, auth) => {
  requireSportsOperator(auth.uid)
  if (
    !calendarEntriesFor(props.competitionId, 'bdl').some(
      (e) => e.bdlLeagueKey === props.league
    )
  ) {
    throw new APIError(
      400,
      'Competition does not belong to the selected league'
    )
  }
  return runMajorCreation({ ...props, role: isProd() ? 'api' : 'dev' })
}
