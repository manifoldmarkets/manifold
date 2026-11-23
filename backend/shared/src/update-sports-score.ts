import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { MULTI_CPMM_MECHANISMS_SQL } from 'common/contract'
import type { SupabaseTransaction } from './supabase/init'

/** Apply only newer observations to an unresolved market. Provider-bound writes also
 * recheck the original identity and public eligibility after a concurrent edit. */
export async function updateSportsScore(
  pg: Pick<SupabaseTransaction, 'oneOrNone'>,
  id: string,
  patch: Record<string, unknown>,
  binding?: { identity: Record<string, unknown>; readStartedAt: number }
) {
  const time = patch.sportsLiveUpdatedTime
  if (typeof time !== 'number' || !Number.isFinite(time))
    throw new Error('Score update time must be finite')
  const bound = binding
    ? `and data @> $4::jsonb and creator_id = any($5)
       and coalesce((data->>'sportsLiveUpdatedTime')::numeric, 0) <= $6::numeric
       and token = 'MANA' and visibility = 'public' and deleted is not true
       and mechanism in ${MULTI_CPMM_MECHANISMS_SQL}
       and coalesce(data->'sportsFixture', 'false'::jsonb) = 'false'::jsonb
       and (($1::jsonb)->>'sportsLiveStatus' <> 'FINISHED'
            or close_time <= to_timestamp($3::double precision / 1000))
       and (data->>'sportsLiveStatus' is distinct from 'FINISHED'
            or ($1::jsonb)->>'sportsLiveStatus' = 'FINISHED')`
    : ''
  const row = await pg.oneOrNone<{ id: string }>(
    `update contracts set data = data || $1::jsonb
     where id = $2 and resolution is null
       and not coalesce((data->>'isResolved')::boolean, false)
       and coalesce((data->>'sportsLiveUpdatedTime')::numeric, 0) < $3::numeric
       ${bound}
     returning id`,
    [
      JSON.stringify(patch),
      id,
      time,
      ...(binding
        ? [
            JSON.stringify(binding.identity),
            MANIFOLD_SPORTS_USER_IDS,
            binding.readStartedAt,
          ]
        : []),
    ]
  )
  return row !== null
}
