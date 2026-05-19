import { LiveMatchScore } from 'shared/sports-markets'

interface CacheEntry {
  scores: LiveMatchScore[]
  updatedAt: number
}

const cache = new Map<string, CacheEntry>()

export function getLiveScoreCache(competitionCode: string): CacheEntry | null {
  return cache.get(competitionCode) ?? null
}

export function setLiveScoreCache(
  competitionCode: string,
  scores: LiveMatchScore[]
): void {
  cache.set(competitionCode, { scores, updatedAt: Date.now() })
}
