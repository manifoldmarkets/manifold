import { Row } from './supabase/utils'

export type season = typeof SEASONS[number]

export const SEASONS = [1, 2, 3] as const
export const CURRENT_SEASON = 3

export const LEAGUES_START = new Date('2023-05-01T00:00:00-07:00') // Pacific Daylight Time (PDT) as time zone offset

const SEASON_END_TIMES = [
  new Date('2023-06-01T12:06:23-07:00'),
  new Date('2023-07-01T12:22:53-07:00'),
  new Date('2023-08-01T17:05:29-07:00'),
]

export const getSeasonMonth = (season: number) => {
  return getSeasonDates(season).start.toLocaleString('default', {
    month: 'long',
  })
}

export const getSeasonDates = (season: number) => {
  const start = new Date(LEAGUES_START)
  start.setMonth(start.getMonth() + season - 1)

  let end: Date
  if (SEASON_END_TIMES[season - 1]) {
    end = new Date(SEASON_END_TIMES[season - 1])
  } else {
    end = new Date(LEAGUES_START)
    end.setMonth(end.getMonth() + season)
  }

  return { start, end }
}

export const getSeasonStatus = (season: number) => {
  const { start, end } = getSeasonDates(season)
  const now = new Date()
  if (now < start) {
    return 'upcoming'
  } else if (now > end) {
    if (!SEASON_END_TIMES[season - 1]) {
      return 'closing-period'
    }
    return 'ended'
  } else {
    return 'current'
  }
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

export const SECRET_NEXT_DIVISION = '???'

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
    return { demotion: 5, promotion: 6, doublePromotion: 0 }
  }
  if (division === 4) {
    return { demotion: 5, promotion: 5, doublePromotion: 0 }
  }
  if (division === 5) {
    return { demotion: 7, promotion: 4, doublePromotion: 0 }
  }
  if (division === 6) {
    return { demotion: 10, promotion: 0, doublePromotion: 0 }
  }
  throw new Error(`Invalid division: ${division}`)
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
export const MAX_COHORT_SIZE = 75

export const prizesByDivisionAndRank = [
  [100, 90, 80, 70, 60, 50, 40],
  [200, 180, 160, 140, 120, 100, 80, 60],
  [400, 360, 320, 280, 240, 200, 160, 120, 80],
  [800, 720, 640, 560, 480, 400, 320, 240, 160, 80],
  [1600, 1440, 1280, 1120, 960, 800, 640, 480, 320, 160],
  [3200, 2880, 2560, 2240, 1920, 1600, 1280, 960, 640, 320],
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
  userId?: string
) => {
  const [seasonSlug, divisionSlug, cohortSlug, userIdSlug] = slugs
  let season = +seasonSlug
  if (!SEASONS.includes(season as season)) {
    season = CURRENT_SEASON
  }

  const seasonRows = rowsBySeason[season]
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
    else division = Math.max(...seasonRows.map((r) => r.division))
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
