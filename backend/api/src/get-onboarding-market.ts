import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertContract } from 'common/supabase/contracts'

// Filters for a good "first bet" market for a brand-new user: open, public, mana,
// binary or multiple-choice (these convert best and are easy to understand), not
// deleted, has at least a couple of traders, and — for binary — not a near-certain
// outcome (so the prediction feels live).
const BASE_WHERE = `
  c.resolution_time is null
  and c.close_time > now()
  and c.visibility = 'public'
  and c.token = 'MANA'
  and c.outcome_type in ('BINARY', 'MULTIPLE_CHOICE')
  and c.deleted = false
  and c.unique_bettor_count > 1
  and (
    c.outcome_type <> 'BINARY'
    or (c.data->>'prob') is null
    or (c.data->>'prob')::numeric between 0.1 and 0.9
  )`

// Returns a single market to seed a new user's first bet during onboarding.
// Prefers a high-importance market within a topic the user just followed, and
// falls back to the most important qualifying market overall. Returns null rather
// than throwing so the onboarding flow can simply skip the step if nothing fits.
export const getOnboardingMarket: APIHandler<'get-onboarding-market'> = async (
  _,
  auth
) => {
  const pg = createSupabaseDirectClient()
  const userId = auth.uid

  // First choice: a market in one of the topics the user picked in onboarding
  // (followTopic -> group_members).
  const matched = await pg.oneOrNone(
    `select c.data, c.importance_score
       from contracts c
       join group_contracts gc on gc.contract_id = c.id
      where gc.group_id in (
              select group_id from group_members where member_id = $1
            )
        and ${BASE_WHERE}
      order by c.importance_score desc nulls last
      limit 1`,
    [userId]
  )
  if (matched) return { market: convertContract(matched) }

  // Fallback: the most important qualifying market overall.
  const fallback = await pg.oneOrNone(
    `select c.data, c.importance_score
       from contracts c
      where ${BASE_WHERE}
      order by c.importance_score desc nulls last
      limit 1`,
    []
  )
  return { market: fallback ? convertContract(fallback) : null }
}
