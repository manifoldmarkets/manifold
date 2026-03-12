import { APIError, APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { TROPHY_DEFINITIONS, getHighestMilestone } from 'common/trophies'
import { getUserAchievements } from './get-user-achievements'

export const claimTrophy: APIHandler<'claim-trophy'> = async (
  { trophyId, milestone },
  auth
) => {
  const def = TROPHY_DEFINITIONS.find((d) => d.id === trophyId)
  if (!def) throw new APIError(400, `Unknown trophy: ${trophyId}`)

  const requestedIdx = def.milestones.findIndex((m) => m.name === milestone)
  if (requestedIdx < 0) {
    throw new APIError(400, `Unknown milestone "${milestone}" for trophy ${trophyId}`)
  }

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

  const highestReachedIdx = def.milestones.indexOf(highest)
  if (requestedIdx > highestReachedIdx) {
    throw new APIError(
      403,
      `Not eligible for ${milestone}: you've reached ${highest.name} but not ${milestone}`
    )
  }

  const pg = createSupabaseDirectClient()

  // Check existing claim
  const existing = await pg.oneOrNone(
    `select milestone from user_trophy_claims
     where user_id = $1 and trophy_id = $2`,
    [auth.uid, trophyId]
  )

  if (existing) {
    const existingIdx = def.milestones.findIndex(
      (m) => m.name === existing.milestone
    )
    if (existingIdx >= requestedIdx) {
      // Already claimed at this level or higher — no-op
      return {
        trophyId,
        milestone: existing.milestone,
        claimedAt: new Date().toISOString(),
      }
    }
  }

  // Upsert — claim up to the requested milestone
  const requested = def.milestones[requestedIdx]
  const row = await pg.one(
    `insert into user_trophy_claims (user_id, trophy_id, milestone, claimed_at)
     values ($1, $2, $3, now())
     on conflict (user_id, trophy_id)
     do update set milestone = excluded.milestone, claimed_at = now()
     returning trophy_id as "trophyId", milestone, claimed_at as "claimedAt"`,
    [auth.uid, trophyId, requested.name]
  )

  return {
    trophyId: row.trophyId,
    milestone: row.milestone,
    claimedAt: row.claimedAt.toISOString(),
  }
}
