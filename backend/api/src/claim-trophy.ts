import { APIError, APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  TROPHY_DEFINITIONS,
  getHighestMilestone,
} from 'common/trophies'
import { getUserAchievements } from './get-user-achievements'

export const claimTrophy: APIHandler<'claim-trophy'> = async (
  { trophyId },
  auth
) => {
  const def = TROPHY_DEFINITIONS.find((d) => d.id === trophyId)
  if (!def) throw new APIError(400, `Unknown trophy: ${trophyId}`)

  // Fetch the user's live stats to validate eligibility
  const stats = await getUserAchievements(
    { userId: auth.uid },
    auth,
    undefined as any
  )

  const value = Number((stats as Record<string, unknown>)[def.statKey]) || 0
  const highest = getHighestMilestone(def, value)
  if (!highest) {
    throw new APIError(
      403,
      `Not eligible: ${def.label} requires at least ${def.milestones[0].threshold} ${def.unit}`
    )
  }

  const highestIdx = def.milestones.indexOf(highest)
  const pg = createSupabaseDirectClient()

  // Check existing claim to prevent downgrades
  const existing = await pg.oneOrNone(
    `select milestone from user_trophy_claims
     where user_id = $1 and trophy_id = $2`,
    [auth.uid, trophyId]
  )

  if (existing) {
    const existingIdx = def.milestones.findIndex(
      (m) => m.name === existing.milestone
    )
    if (existingIdx >= highestIdx) {
      // Already claimed at this level or higher — return existing
      return {
        trophyId,
        milestone: existing.milestone,
        claimedAt: new Date().toISOString(),
      }
    }
  }

  // Upsert — we've verified this is an upgrade
  const row = await pg.one(
    `insert into user_trophy_claims (user_id, trophy_id, milestone, claimed_at)
     values ($1, $2, $3, now())
     on conflict (user_id, trophy_id)
     do update set milestone = excluded.milestone, claimed_at = now()
     returning trophy_id as "trophyId", milestone, claimed_at as "claimedAt"`,
    [auth.uid, trophyId, highest.name]
  )

  return {
    trophyId: row.trophyId,
    milestone: row.milestone,
    claimedAt: row.claimedAt.toISOString(),
  }
}
