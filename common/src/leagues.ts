import { LeagueChangeData } from './notification'
import { Row } from './supabase/utils'

export const LEAGUES_START = new Date('2023-05-01T00:00:00-07:00') // Pacific Daylight Time (PDT) as time zone offset

export type League = {
  season: number
  division: number
  cohort: string
  rank: number
  createdTime: string
  manaEarned: number
  manaEarnedBreakdown: Record<number, number>
  userId: string
  rankSnapshot: number
}

export const getSeasonMonth = (season: number) => {
  return getSeasonDates(season).start.toLocaleString('default', {
    month: 'long',
  })
}

export const getSeasonDates = (season: number) => {
  const start = new Date(LEAGUES_START)
  start.setMonth(start.getMonth() + season - 1)

  // NOTE: The exact season end time used for backend logic (rollover, payouts)
  // is now stored in the leagues_season_end_times table in the database.
  // This function now calculates an approximate end date primarily for display purposes
  // or as a fallback if the database row doesn't exist.
  const approxEnd = new Date(LEAGUES_START)
  approxEnd.setMonth(approxEnd.getMonth() + season)
  // Add a day, just to be safely after the potential random close time.
  approxEnd.setDate(approxEnd.getDate() + 1)

  return { start, approxEnd }
}

export const getSeasonCountdownEnd = (season: number) => {
  const end = new Date(LEAGUES_START)
  end.setMonth(end.getMonth() + season)
  return end
}

export type LeagueChangeNotificationData = LeagueChangeData & {
  userId: string
}

export const DIVISION_NAMES = {
  0: 'Silicon',
  1: 'Bronze',
  2: 'Silver',
  3: 'Gold',
  4: 'Platinum',
  5: 'Diamond',
  6: 'Masters',
} as { [key: number | string]: string }
const DIVISION_NAME_TO_NUMBER = Object.fromEntries(
  Object.entries(DIVISION_NAMES).map(([k, v]) => [v, +k])
) as { [key: string]: number }

export const SECRET_NEXT_DIVISION = '???'

export const getDivisionNumber = (division: string) => {
  const num = DIVISION_NAME_TO_NUMBER[division]
  if (num === undefined) throw new Error(`Invalid division: ${division}`)
  return num
}

export const getDemotionAndPromotionCount = (division: number) => {
  if (division === 0) {
    return { demotion: 0, promotion: 0, doublePromotion: 0 }
  }
  if (division === 1) {
    return { demotion: 0, promotion: 10, doublePromotion: 2 }
  }
  if (division === 2) {
    return { demotion: 5, promotion: 7, doublePromotion: 1 }
  }
  if (division === 3) {
    return { demotion: 6, promotion: 6, doublePromotion: 0 }
  }
  if (division === 4) {
    return { demotion: 10, promotion: 5, doublePromotion: 0 }
  }
  if (division === 5) {
    return { demotion: 10, promotion: 2, doublePromotion: 0 }
  }
  if (division === 6) {
    return { demotion: 19, promotion: 0, doublePromotion: 0 }
  }
  throw new Error(`Invalid division: ${division}`)
}

export const getDemotionAndPromotionCountBySeason = (
  season: number,
  division: number
) => {
  if (season === 14) {
    if (division === 6) {
      return { demotion: 18, promotion: 0, doublePromotion: 0 }
    }
  }
  if (season === 13) {
    if (division === 5) {
      return { demotion: 10, promotion: 2, doublePromotion: 0 }
    }
    if (division === 6) {
      return { demotion: 29, promotion: 0, doublePromotion: 0 }
    }
  }
  if (season > 8 && season < 13) {
    if (division === 5)
      return { demotion: 12, promotion: 3, doublePromotion: 0 }
  }
  if (season === 8) {
    if (division === 6)
      return { demotion: 34, promotion: 0, doublePromotion: 0 }
  }
  if (season === 6 || season === 7) {
    if (division === 3) {
      return { demotion: 5, promotion: 6, doublePromotion: 0 }
    }
    if (division === 6)
      return { demotion: 25, promotion: 0, doublePromotion: 0 }
  }
  if (season === 5) {
    if (division === 3) return { demotion: 5, promotion: 6, doublePromotion: 0 }
    if (division === 4) return { demotion: 5, promotion: 5, doublePromotion: 0 }
    if (division === 5) return { demotion: 8, promotion: 3, doublePromotion: 0 }
    if (division === 6)
      return { demotion: 25, promotion: 0, doublePromotion: 0 }
  }
  if (season === 4) {
    if (division === 3) return { demotion: 5, promotion: 6, doublePromotion: 0 }
    if (division === 4) return { demotion: 5, promotion: 5, doublePromotion: 0 }
    if (division === 5) return { demotion: 7, promotion: 4, doublePromotion: 0 }
    if (division === 6)
      return { demotion: 17, promotion: 0, doublePromotion: 0 }
  }
  if (season < 4) {
    if (division === 3) return { demotion: 5, promotion: 6, doublePromotion: 0 }
    if (division === 4) return { demotion: 5, promotion: 5, doublePromotion: 0 }
    if (division === 5) return { demotion: 6, promotion: 5, doublePromotion: 0 }
  }
  return getDemotionAndPromotionCount(division)
}

export const getDivisionChange = (
  division: number,
  rank: number,
  manaEarned: number,
  cohortSize: number
) => {
  const { demotion, promotion, doublePromotion } =
    getDemotionAndPromotionCount(division)

  // Require 100 mana earned to advance from Bronze.
  if (division === 1 && manaEarned < 100) {
    return 0
  }

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

export const getMaxDivisionBySeason = (season: number) => {
  if (season === 1) return 4
  if (season === 2) return 5
  return 6
}

export type league_row = Row<'leagues'>
export type league_user_info = league_row & { rank: number }

export const MAX_COHORT_SIZE = 100

export const getCohortSize = (division: number) => {
  if (division === getDivisionNumber('Bronze')) return 100
  if (division === getDivisionNumber('Silver')) return 50
  if (division === getDivisionNumber('Gold')) return 50
  if (division === getDivisionNumber('Masters')) return 100
  return 25
}

export const prizesByDivisionAndRank = [
  [100, 50, 40, 30, 20, 10, 5],
  [200, 100, 90, 80, 70, 60, 50, 40],
  [400, 200, 180, 160, 140, 120, 100, 80, 60],
  [800, 400, 360, 320, 280, 240, 200, 160, 120, 80],
  [1600, 800, 720, 640, 560, 480, 400, 320, 240, 160],
  [6400, 3200, 1600, 1440, 1200, 1120, 960, 800, 640, 480],
]

export const getLeaguePrize = (division: number, rank: number) => {
  const divisionPrizes = prizesByDivisionAndRank[division - 1]
  if (!divisionPrizes) return 0
  return divisionPrizes[rank - 1] || 0
}

export const getLeaguePath = (
  season: number,
  division: number,
  cohort: string,
  userId?: string
) => {
  const divisionName = DIVISION_NAMES[division].toLowerCase()
  return `/leagues/${season}/${divisionName}/${cohort}/${userId ?? ''}`
}

export const parseLeaguePath = (
  slugs: string[],
  rowsBySeason: { [season: number]: league_user_info[] },
  seasons: number[],
  userId?: string
) => {
  const [seasonSlug, divisionSlug, cohortSlug, userIdSlug] = slugs
  let season = +seasonSlug
  if (!seasons.includes(season)) {
    season = seasons[seasons.length - 1]
  }

  const seasonRows = rowsBySeason[season] ?? []
  const userIdToFind = userIdSlug || userId
  const userRow = seasonRows.find((row) => row.user_id === userIdToFind)

  let division: number
  if (Object.keys(DIVISION_NAMES).includes(divisionSlug)) {
    division = +divisionSlug
  } else {
    const divisionMatchingName = Object.keys(DIVISION_NAMES).find(
      (key) =>
        DIVISION_NAMES[key]?.toLowerCase() === divisionSlug?.toLowerCase()
    )
    if (divisionMatchingName) division = +divisionMatchingName
    else if (userRow) division = userRow.division
    else division = getMaxDivisionBySeason(season)
  }

  const divisionRows = seasonRows.filter((row) => row.division === division)
  const cohorts = divisionRows.map((row) => row.cohort)

  const cohort =
    cohorts.find((c) => c?.toLowerCase() === cohortSlug?.toLowerCase()) ??
    (userRow && userRow.division === division ? userRow.cohort : cohorts[0])

  const highlightedUserId =
    userRow && cohort === userRow.cohort ? userRow.user_id : undefined

  return {
    season,
    division,
    cohort,
    highlightedUserId,
  }
}
