import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { SportsMarket } from 'common/sports'
import { ENV_CONFIG } from 'common/envs/constants'

export const sportsMarkets: APIHandler<'sports-markets'> = async (
  props
) => {

  const { sportsLeague } = props
  const pg = createSupabaseDirectClient()

  const rows = await pg.manyOrNone<{ data: any }>(
    `select data
     from contracts
     where data->>'sportsLeague' = $1
       and token = 'MANA'
     order by (data->>'closeTime')::bigint asc`,
    [sportsLeague]
  )

  const now = Date.now()
  const attentionThresholdMs = 3 * 60 * 60 * 1000 // 3 hours

  const markets: SportsMarket[] = rows.map((r) => {
    const d = r.data
    // closeTime / resolutionTime are stored as numbers in contract.data, not
    // strings — Number() preserves precision and avoids the string-coercion hop.
    const closeTimeRaw = Number(d.closeTime ?? 0)
    const closeTime: number = Number.isFinite(closeTimeRaw) ? closeTimeRaw : 0
    const resolution: string | null = d.resolution ?? null

    const homeTeam: string | null = (d.sportsHomeTeam as string) ?? null
    const awayTeam: string | null = (d.sportsAwayTeam as string) ?? null
    const isBinary = !d.answers?.length && (homeTeam || awayTeam)

    let resolvedAnswer: string | null = null
    if (resolution) {
      if (d.answers?.length) {
        const winner = (d.answers as Array<{ id: string; text: string }>).find(
          (a) => a.id === resolution
        )
        resolvedAnswer = winner?.text ?? resolution
      } else {
        // Binary market: resolution is YES/NO/NA
        if (resolution === 'YES') resolvedAnswer = homeTeam
        else if (resolution === 'NO') resolvedAnswer = awayTeam
        else if (resolution === 'NA') resolvedAnswer = 'Cancelled/Tie'
      }
    }

    const needsAttention =
      !resolution && closeTime > 0 && now - closeTime > attentionThresholdMs

    // For binary sports markets, synthesize two answer objects so the dashboard
    // card can render team names and probabilities without special-casing.
    const answers: Array<{ id: string; text: string; prob: number }> =
      isBinary
        ? [
            { id: 'YES', text: homeTeam!, prob: d.prob ?? 0.5 },
            { id: 'NO', text: awayTeam!, prob: 1 - (d.prob ?? 0.5) },
          ]
        : (d.answers ?? []).map(
            (a: { id: string; text: string; prob?: number }) => ({
              id: a.id,
              text: a.text,
              prob: a.prob ?? 0,
            })
          )

    return {
      id: d.id as string,
      question: d.question as string,
      closeTime,
      sportsStartTimestamp: (d.sportsStartTimestamp as string) ?? null,
      resolution,
      resolvedAnswer,
      sportsHomeTeam: homeTeam,
      sportsAwayTeam: awayTeam,
      sportsLeague: (d.sportsLeague as string) ?? null,
      resolutionTime:
        d.resolutionTime != null && Number.isFinite(Number(d.resolutionTime))
          ? Number(d.resolutionTime)
          : null,
      sportsHomeScore: d.sportsHomeScore != null ? (d.sportsHomeScore as number) : null,
      sportsAwayScore: d.sportsAwayScore != null ? (d.sportsAwayScore as number) : null,
      sportsScoreDuration: (d.sportsScoreDuration as string) ?? null,
      sportsPenHome: d.sportsPenHome != null ? (d.sportsPenHome as number) : null,
      sportsPenAway: d.sportsPenAway != null ? (d.sportsPenAway as number) : null,
      sportsLiveStatus: (d.sportsLiveStatus as string) ?? null,
      sportsLiveMinute: (d.sportsLiveMinute as string) ?? null,
      sportsLiveUpdatedTime:
        d.sportsLiveUpdatedTime != null &&
        Number.isFinite(Number(d.sportsLiveUpdatedTime))
          ? Number(d.sportsLiveUpdatedTime)
          : null,
      volume: d.volume ?? 0,
      // Full URL incl. hostname, consistent with the raw markets API. The
      // frontend builds its own in-app path from creatorUsername + slug.
      url: `https://${ENV_CONFIG.domain}/${d.creatorUsername}/${d.slug}`,
      creatorUsername: d.creatorUsername as string,
      slug: d.slug as string,
      needsAttention,
      answers,
    }
  })

  // Surface "needs attention" markets first
  markets.sort((a, b) => {
    if (a.needsAttention && !b.needsAttention) return -1
    if (!a.needsAttention && b.needsAttention) return 1
    return a.closeTime - b.closeTime
  })

  return { markets }
}
