import { db } from './db'
import { CURRENT_SEASON } from 'common/leagues'

export async function getLeagueInfo(userId: string) {
  const { data } = await db
    .from('user_league_info')
    .select('*')
    .eq('user_id', userId)
    .eq('season', CURRENT_SEASON)
    .limit(1)
  if (data && data.length > 0) {
    return data[0]
  }
  return null
}

export async function getLeagueInfoFromUsername(username: string) {
  const { data } = await db.rpc('get_user_league_info_from_username', {
    this_season: CURRENT_SEASON,
    this_username: username,
  })
  if (data && data.length > 0) {
    return data[0]
  }
  return null
}

export async function getLeagueRows() {
  const { data: rows } = await db
    .from('leagues')
    .select('*')
    .order('mana_earned', { ascending: false })
  return rows ?? []
}
