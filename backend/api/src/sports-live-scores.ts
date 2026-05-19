import { APIHandler } from './helpers/endpoint'
import { TOURNAMENT_CONFIGS } from 'shared/sports-markets'
import { getLiveScoreCache } from './sports-live-cache'

export const sportsLiveScores: APIHandler<'sports-live-scores'> = async ({
  tag,
}) => {
  const config = Object.values(TOURNAMENT_CONFIGS).find(
    (c) => c.officialGroupSlug === tag
  )
  if (!config) return { scores: [], updatedAt: null }

  const cached = getLiveScoreCache(config.footballDataCode)
  return {
    scores: cached?.scores ?? [],
    updatedAt: cached?.updatedAt ?? null,
  }
}
