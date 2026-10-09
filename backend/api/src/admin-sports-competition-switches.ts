// The sports scheduler's switches on /admin/sports: which calendar phases the
// daily sports-odds-create job creates game markets for.

import { uniq } from 'lodash'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import {
  getCompetitionSwitchRows,
  setCompetitionSwitch,
} from 'shared/supabase/sports-competition-switches'
import {
  autoCreates,
  calendarPhaseKey,
  calendarStatus,
  competitionSwitchError,
  SPORTS_CALENDAR,
} from 'common/sports-calendar'

export const adminSportsCompetitionSwitches: APIHandler<
  'admin-sports-competition-switches'
> = async (_props, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  const pg = createSupabaseDirectClient()
  const rows = await getCompetitionSwitchRows(pg)
  const byKey = Object.fromEntries(rows.map((r) => [calendarPhaseKey(r), r]))
  const switches = Object.fromEntries(
    rows.map((r) => [calendarPhaseKey(r), r.on])
  )
  const userIds = uniq(rows.map((r) => r.updatedBy))
  const usernames: Record<string, string> = userIds.length
    ? Object.fromEntries(
        await pg.map(
          `select id, username from users where id = any($1)`,
          [userIds],
          (r) => [r.id, r.username] as const
        )
      )
    : {}

  const now = Date.now()
  return {
    switches: SPORTS_CALENDAR.filter((e) => e.oddsKey).map((e) => {
      const row = byKey[calendarPhaseKey(e)]
      return {
        competitionId: e.competitionId,
        competition: e.competition,
        phase: e.phase,
        sport: e.sport,
        startDate: e.startDate,
        endDate: e.endDate,
        status: calendarStatus(e, now),
        on: autoCreates(e, switches),
        defaultOn: autoCreates(e, {}),
        locked: e.locked,
        notes: e.notes,
        updatedBy: row ? usernames[row.updatedBy] ?? row.updatedBy : undefined,
        updatedTime: row?.updatedTime,
      }
    }),
  }
}

export const adminSportsSetCompetitionSwitch: APIHandler<
  'admin-sports-set-competition-switch'
> = async (props, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  const { competitionId, phase, on } = props
  const error = competitionSwitchError(competitionId, phase, on)
  if (error) throw new APIError(400, error)
  const pg = createSupabaseDirectClient()
  await setCompetitionSwitch(pg, { competitionId, phase, on, userId: auth.uid })
  log(
    `[sports] ${auth.uid} switched ${competitionId} / ${phase} ${
      on ? 'on' : 'off'
    }`
  )
  return { on }
}
