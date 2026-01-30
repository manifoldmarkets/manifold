import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'

export const adminGetNewUsers: APIHandler<'admin-get-new-users'> = async (
  body,
  auth
) => {
  // Only admins can access this endpoint
  throwErrorIfNotAdmin(auth.uid)

  const { limit = 100 } = body
  const pg = createSupabaseDirectClient()

  const results = await pg.manyOrNone<{
    id: string
    created_time: string
    username: string
    name: string
    avatar_url: string
    balance: number
    referred_by_user_id: string | null
    referred_by_username: string | null
    referred_by_name: string | null
    bonus_eligibility: 'verified' | 'grandfathered' | 'ineligible' | null
    purchased_mana: boolean | null
    email: string | null
    ip_address: string | null
  }>(
    `SELECT 
      u.id,
      u.created_time,
      u.username,
      u.name,
      u.data->>'avatarUrl' as avatar_url,
      u.balance,
      u.data->>'referredByUserId' as referred_by_user_id,
      ref.username as referred_by_username,
      ref.name as referred_by_name,
      u.data->>'bonusEligibility' as bonus_eligibility,
      (u.data->>'purchasedMana')::boolean as purchased_mana,
      pu.data->>'email' as email,
      pu.data->>'initialIpAddress' as ip_address
    FROM users u
    LEFT JOIN users ref ON ref.id = (u.data->>'referredByUserId')
    LEFT JOIN private_users pu ON pu.id = u.id
    ORDER BY u.created_time DESC
    LIMIT $1`,
    [limit]
  )

  const users = results.map((row) => ({
    id: row.id,
    createdTime: new Date(row.created_time).getTime(),
    username: row.username,
    name: row.name,
    avatarUrl: row.avatar_url,
    balance: row.balance,
    referredByUserId: row.referred_by_user_id,
    referredByUsername: row.referred_by_username,
    referredByName: row.referred_by_name,
    bonusEligibility: row.bonus_eligibility,
    purchasedMana: row.purchased_mana ?? false,
    email: row.email,
    ipAddress: row.ip_address,
  }))

  return { users }
}
