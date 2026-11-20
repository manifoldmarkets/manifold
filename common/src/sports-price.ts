/** Trading prices at the tails stay distinct from a certain outcome. */
export function formatSportsPrice(probability: number): string {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1)
    return '—'
  if (probability < 0.01) return '<1%'
  if (probability > 0.99) return '>99%'
  return Math.round(probability * 100) + '%'
}
