import type { SportsProvider } from '../sports-provider'

export const SPORTS_ATTENTION_DEFAULT_LIMIT = 50
export const SPORTS_ATTENTION_MAX_LIMIT = 100

export type SportsAttentionItem = {
  id: string
  question: string
  href: string | null
  provider: Exclude<SportsProvider, 'fixture'> | 'unknown'
  league: string | null
  reason: string
  source: 'stored' | 'overdue'
  since: number | null
  closeTime: number | null
}
export type SportsAttentionPage = {
  items: SportsAttentionItem[]
  nextCursor: string | null
}

export const MAX_ATTENTION_TIME = 8_640_000_000_000_000
export function parseSportsAttentionCursor(value: string) {
  // Oldest first, unknown onset last. Keep the first page's clock across requests.
  if (typeof value !== 'string' || value.length > 256) return null
  const match =
    /^1:([1-9][0-9]{0,15}):(u|[1-9][0-9]{0,15}):([A-Za-z0-9_-]{1,128})$/.exec(
      value
    )
  if (!match || match[0] !== value) return null
  const asOf = Number(match[1])
  const since = match[2] === 'u' ? null : Number(match[2])
  if (asOf > MAX_ATTENTION_TIME || (since !== null && since > asOf)) return null
  return { asOf, since, id: match[3] }
}
export const isSportsAttentionCursor = (value: string) =>
  parseSportsAttentionCursor(value) !== null
