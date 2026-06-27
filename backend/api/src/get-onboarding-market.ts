import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertContract } from 'common/supabase/contracts'

// A new user's first bet should land on a market that is:
//  - easy to understand: binary / multiple-choice, mana (not cash/spice)
//  - actively traded: a real crowd has already engaged, which both signals
//    quality AND is good evidence the resolution criteria are clear enough that
//    people are confident betting on it
//  - not contested / awaiting clarification: so the newcomer isn't burned by a
//    confusing or disputed resolution
//  - not a near-certain outcome (for binary): so there's a real call to make
//
// We rank by importance_score (Manifold's trending signal, which already folds
// in volume/traders/recency) and fall back from "well-traded market in a topic
// you just followed" toward "any solid market", relaxing the trader floor before
// dropping the topic constraint. Returns { market: null } only if nothing
// qualifies — the onboarding step then simply skips itself.

// "Good amount of traders" — strict floor first, then a softer floor on fallback.
const MIN_TRADERS_STRICT = 25
const MIN_TRADERS_RELAXED = 5

// Shared quality + resolution-clarity filters. `$1` = minimum unique bettors.
const qualityWhere = `
  c.resolution_time is null
  -- open with a little runway, so it can't resolve mid-onboarding
  and c.close_time > now() + interval '2 hours'
  and c.visibility = 'public'
  and c.token = 'MANA'
  and c.outcome_type in ('BINARY', 'MULTIPLE_CHOICE')
  and c.deleted = false
  and c.unique_bettor_count >= $1
  -- binary markets shouldn't be a near-certain outcome (no real decision to make)
  and (
    c.outcome_type <> 'BINARY'
    or (c.data->>'prob') is null
    or (c.data->>'prob')::numeric between 0.1 and 0.9
  )
  -- multiple-choice: only the standard mechanism, and skip markets whose favorite
  -- is already near-certain (the UI pre-selects the top answer, so there should be
  -- a real call to make there too)
  and (
    c.outcome_type <> 'MULTIPLE_CHOICE'
    or (
      c.mechanism = 'cpmm-multi-1'
      and not exists (
        select 1 from answers a
        where a.contract_id = c.id
          and a.resolution is null
          and a.prob >= 0.9
      )
    )
  )
  -- exclude markets with an unresolved clarification request (ambiguous wording)
  and not exists (
    select 1 from pending_clarifications pc
    where pc.contract_id = c.id
      and pc.applied_time is null
      and pc.cancelled_time is null
  )
  -- exclude markets under active moderation / dispute
  and not exists (
    select 1 from mod_reports mr
    where mr.contract_id = c.id
      and mr.status in ('new', 'under review', 'needs admin')
  )`

export const getOnboardingMarket: APIHandler<'get-onboarding-market'> = async (
  _,
  auth
) => {
  const pg = createSupabaseDirectClient()
  const userId = auth.uid

  // useTopics: restrict to markets in a group the user just followed in
  // onboarding (followTopic -> group_members). minTraders: the unique-bettor floor.
  const pick = async (useTopics: boolean, minTraders: number) => {
    const sql = useTopics
      ? `select c.data, c.importance_score
         from contracts c
         where c.id in (
                 select gc.contract_id
                 from group_contracts gc
                 where gc.group_id in (
                   select group_id from group_members where member_id = $2
                 )
               )
           and ${qualityWhere}
         order by c.importance_score desc nulls last
         limit 1`
      : `select c.data, c.importance_score
         from contracts c
         where ${qualityWhere}
         order by c.importance_score desc nulls last
         limit 1`
    const row = await pg.oneOrNone(
      sql,
      useTopics ? [minTraders, userId] : [minTraders]
    )
    return row ? convertContract(row) : null
  }

  // Best → acceptable.
  const tiers: [useTopics: boolean, minTraders: number][] = [
    [true, MIN_TRADERS_STRICT],
    [true, MIN_TRADERS_RELAXED],
    [false, MIN_TRADERS_STRICT],
    [false, MIN_TRADERS_RELAXED],
  ]
  for (const [useTopics, minTraders] of tiers) {
    const market = await pick(useTopics, minTraders)
    if (market) return { market }
  }

  return { market: null }
}
