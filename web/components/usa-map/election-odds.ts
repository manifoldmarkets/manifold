export type Odds = {
  dem: number
  rep: number
  other: number
  notDem?: number
  notRep?: number
  unknown?: number
}
export const OUTCOMES = [
  'dem',
  'rep',
  'other',
  'notDem',
  'notRep',
  'unknown',
] as const

export function normalizeOdds(odds: Odds): Odds | undefined {
  const values = Object.values(odds)
  const sum = values.reduce((a, b) => a + b, 0)
  if (values.some((p) => !Number.isFinite(p) || p < 0) || sum <= 0)
    return undefined
  return {
    dem: odds.dem / sum,
    rep: odds.rep / sum,
    other: odds.other / sum,
    ...(odds.notDem !== undefined ? { notDem: odds.notDem / sum } : {}),
    ...(odds.notRep !== undefined ? { notRep: odds.notRep / sum } : {}),
    ...(odds.unknown !== undefined ? { unknown: odds.unknown / sum } : {}),
  }
}
