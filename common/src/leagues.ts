import { PlainTablesAndViews } from './supabase/utils'

export type season = typeof SEASONS[number]

export const SEASONS = [1] as const
export const CURRENT_SEASON = 1

export const SEASON_END = new Date('2023-06-01T00:00:00-07:00') // Pacific Daylight Time (PDT) as time zone offset

export const DIVISION_NAMES = {
  1: 'Bronze',
  2: 'Silver',
  3: 'Gold',
  4: 'Platinum',
} as { [key: number | string]: string }

export const SECRET_NEXT_DIVISION = 'Diamond'

export const getDemotionAndPromotionCount = (division: number) => {
  if (division === 1) {
    return { demotion: 0, promotion: 10, doublePromotion: 2 }
  }
  if (division === 2) {
    return { demotion: 5, promotion: 7, doublePromotion: 1 }
  }
  if (division === 3) {
    return { demotion: 5, promotion: 6, doublePromotion: 0 }
  }
  return { demotion: 5, promotion: 5, doublePromotion: 0 }
}

export type league_row = PlainTablesAndViews['leagues']
export type league_user_info = PlainTablesAndViews['user_league_info']

export const LEAGUES_ENABLED = false
