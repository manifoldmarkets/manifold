export type season = typeof SEASONS[number]
export type division = keyof typeof DIVISION_NAMES

export const SEASONS = [1] as const
export const DIVISION_NAMES = {
  1: 'Bronze',
  2: 'Silver',
  3: 'Gold',
  4: 'Platinum',
} as const

export const getDivisionName = (division: number | string) =>
  DIVISION_NAMES[+division as division]
