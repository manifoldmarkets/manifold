import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

async function refreshMV(name: string) {
  const pg = createSupabaseDirectClient()
  log(`Refreshing MV: ${name}`)
  // Use CONCURRENTLY to reduce locking; requires unique index which we have.
  await pg.none(`refresh materialized view concurrently ${name}`)
  log(`Refreshed MV: ${name}`)
}

export const refreshAchVolume = async () => refreshMV('mv_ach_volume')
export const refreshAchComments = async () => refreshMV('mv_ach_comments')
export const refreshAchLeagues = async () => refreshMV('mv_ach_leagues')
export const refreshAchPnl = async () => refreshMV('mv_ach_pnl')
export const refreshAchTxns = async () => refreshMV('mv_ach_txns_achievements')
export const refreshAchCreatorContracts = async () =>
  refreshMV('mv_ach_creator_contracts')
export const refreshAchReferrals = async () => refreshMV('mv_ach_referrals')
export const refreshAchCreatorTraders = async () =>
  refreshMV('mv_ach_creator_traders')
export const refreshAchAccountAge = async () => refreshMV('mv_ach_account_age')
