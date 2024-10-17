import { APIError, APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getLeaderboard: APIHandler<'leaderboard'> = async ({
  groupId,
  limit,
  token,
  kind,
}) => {
  if (kind === 'referral' && groupId)
    throw new APIError(400, 'Referrals are not per-topic')

  const pg = createSupabaseDirectClient()

  let query = ''
  if (kind === 'creator') {
    query = `
      SELECT c.creator_id as user_id, COUNT(*) as score
      FROM contracts c
      JOIN user_contract_metrics ucm ON ucm.contract_id = c.id
      WHERE ucm.answer_id IS NULL
      ${
        groupId
          ? 'AND c.id IN (SELECT contract_id FROM group_contracts WHERE group_id = $1)'
          : ''
      }
      GROUP BY c.creator_id
      ORDER BY score DESC
      LIMIT $2
    `
  } else if (kind === 'profit') {
    query = `
      SELECT user_id, SUM(profit) as score
      FROM user_contract_metrics
      WHERE answer_id IS NULL
      ${
        groupId
          ? 'AND contract_id IN (SELECT contract_id FROM group_contracts WHERE group_id = $1)'
          : ''
      }
      GROUP BY user_id
      ORDER BY score DESC
      LIMIT $2
    `
  } else if (kind === 'referral') {
    query = `
      SELECT referred_by_user_id as user_id, COUNT(*) as score
      FROM users
      WHERE referred_by_user_id IS NOT NULL
      GROUP BY referred_by_user_id
      ORDER BY score DESC
      LIMIT $2
    `
  }

  const result = await pg.manyOrNone(
    query,
    groupId ? [groupId, limit] : [limit]
  )
  return result.map((r) => ({ userId: r.user_id, score: parseFloat(r.score) }))
}
