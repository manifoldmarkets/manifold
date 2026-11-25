import { pick } from 'lodash'
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
      : {
          scope: props.scope,
          cap: props.cap,
          baseAnte: null,
          startsOn: null,
          groupSlugs: null,
        }
  await saveCreationSetting(
    createSupabaseDirectClient(),
    row,
    auth.uid,
    props.expected ?? null
  )
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
  if (!props.dryRun && (!props.maxAntes || !props.confirmations))
    throw new APIError(
      409,
      'Preview again to confirm the teams, kickoff and maximum ante for each game.'
    )
  const { created, wouldCreate, skipped, errors, log } = await runMajorCreation(
    {
      ...props,
      operator: true,
      role: isProd() ? 'api' : 'dev',
    }
  )
  return {
    created,
    wouldCreate,
    skipped,
    errors,
    log: log.map((decision) =>
      pick(decision, [
        'league',
        'eventId',
        'question',
        'status',
        'reason',
        'contractId',
        'answerLabels',
        'ante',
        'confirmation',
      ] as const)
    ),
  }
}
