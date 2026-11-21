import { APIError, APIHandler } from 'api/helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from 'api/helpers/rate-limit'
import { convertTrophyClaim, getTrophyClaims } from 'api/helpers/trophies'
import {
  getMilestone,
  getMilestonesToClaim,
  getTrophyDefinition,
  getTrophyStatValue,
} from 'common/trophies'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { loadUserAchievements } from './get-user-achievements'

export const claimTrophy: APIHandler<'claim-trophy'> =
  onlyUsersWhoCanPerformAction(
    'claimTrophy',
    async ({ trophyId, milestoneId }, auth) => {
      const def = getTrophyDefinition(trophyId)
      if (!def) throw new APIError(404, 'Trophy not found')
      const milestone = getMilestone(def, milestoneId)
      if (!milestone) throw new APIError(404, 'Milestone not found')

      // Same numbers the profile shows. A stat can only grow, apart from rare
      // cases such as a deleted comment, and a claim is kept either way.
      const stats = await loadUserAchievements(auth.uid)
      const value = getTrophyStatValue(def, stats)
      const toClaim = getMilestonesToClaim(def, milestoneId, value)
      if (!toClaim) {
        throw new APIError(
          403,
          `You haven't reached ${
            milestone.name
          } yet: it needs ${milestone.threshold.toLocaleString()} ${def.unit}`
        )
      }

      // One row per milestone. Repeated or concurrent claims insert nothing
      // the second time, and a claim can never be lowered.
      const pg = createSupabaseDirectClient()
      const inserted = await pg.manyOrNone<{
        trophy_id: string
        milestone_id: string
        claimed_time: Date
      }>(
        `insert into user_trophy_milestones (user_id, trophy_id, milestone_id)
         select $1, $2, unnest($3::text[])
         on conflict (user_id, trophy_id, milestone_id) do nothing
         returning trophy_id, milestone_id, claimed_time`,
        [auth.uid, def.id, toClaim.map((m) => m.id)]
      )

      return {
        newlyClaimed: inserted.map(convertTrophyClaim),
        claims: await getTrophyClaims(pg, auth.uid),
      }
    }
  )
