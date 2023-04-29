import { PlainTablesAndViews } from './supabase/utils'

export type season = typeof SEASONS[number]
export type division = keyof typeof DIVISION_NAMES

export const SEASONS = [1] as const
export const CURRENT_SEASON = 1

export const DIVISION_NAMES = {
  1: 'Bronze',
  2: 'Silver',
  3: 'Gold',
  4: 'Platinum',
} as const

export const getDivisionName = (division: number | string) =>
  DIVISION_NAMES[+division as division]

export type league_user_info = PlainTablesAndViews['user_league_info']

export const LEAGUES_ENABLED = true