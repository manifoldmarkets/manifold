import { db } from './db'
import { CURRENT_SEASON } from 'common/leagues'

export async function getLeagueInfo(userId: string) {
  const { data } = await db
    .from('user_league_info')
    .select('*')
    .eq('user_id', userId)
    .eq('season', CURRENT_SEASON)
    .single()
  return data
}
