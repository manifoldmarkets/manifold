import { Row } from './supabase/utils'

export type season = typeof SEASONS[number]

export const SEASONS = [1] as const
export const CURRENT_SEASON = 1

export const LEAGUES_START = new Date('2023-05-01T00:00:00-07:00') // Pacific Daylight Time (PDT) as time zone offset

export const getSeasonMonth = (season: number) => {
  return getSeasonDates(season).start.toLocaleString('default', {
    month: 'long',
  })
}

export const getSeasonDates = (season: number) => {
  const start = new Date(LEAGUES_START)
  start.setMonth(start.getMonth() + season - 1)
  const end = new Date(LEAGUES_START)
  end.setMonth(end.getMonth() + season)
  return { start, end }
}

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

export const getDivisionChange = (
  division: number,
  rank: number,
  cohortSize: number
) => {
  const { demotion, promotion, doublePromotion } =
    getDemotionAndPromotionCount(division)
  if (rank <= doublePromotion) {
    return 2
  }
  if (rank <= promotion) {
    return 1
  }
  if (rank > cohortSize - demotion) {
    return -1
  }
  return 0
}

export type league_row = Row<'leagues'>
export type league_user_info = league_row & { rank: number }

export const COHORT_SIZE = 25
export const MAX_COHORT_SIZE = 35

export const rewardsData = [
  [500, 400, 300, 250, 200, 150, 100],
  [1000, 750, 600, 500, 450, 400, 350, 300],
  [1500, 1000, 750, 600, 500, 450, 400, 350, 300],
  [2000, 1500, 1000, 750, 600, 500, 450, 400, 350, 300],
]

export const getLeaguePath = (
  season: number,
  division: number,
  cohort: string,
  userId?: string
) => {
  const divisionName = DIVISION_NAMES[division].toLowerCase()
  return `/leagues/${season}/${divisionName}/${cohort}/${userId ?? ''}`
}
