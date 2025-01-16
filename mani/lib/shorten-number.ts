export const formatShortened = (num: number): string => {
  const absNum = Math.abs(num)
  const sign = num < 0 ? '-' : ''

  if (absNum < 1000) return `${sign}${Math.round(absNum)}`
  if (absNum < 10000) return `${sign}${(absNum / 1000).toFixed(1)}k`
  if (absNum < 1000000) return `${sign}${Math.round(absNum / 1000)}k`
  if (absNum < 10000000) return `${sign}${(absNum / 1000000).toFixed(1)}m`
  if (absNum < 1000000000) return `${sign}${Math.round(absNum / 1000000)}m`
  return `${sign}${Math.round(absNum / 1000000000)}b`
}
