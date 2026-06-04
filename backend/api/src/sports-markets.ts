import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { ENV_CONFIG } from 'common/envs/constants'
import { SportsMarket } from 'common/sports'

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
    const closeTime: number = parseInt(d.closeTime ?? '0', 10)
    const resolution: string | null = d.resolution ?? null

    let resolvedAnswer: string | null = null
    if (resolution && d.answers) {
      const answers: Array<{ id: string; text: string }> = d.answers
      const winner = answers.find((a) => a.id === resolution)
      resolvedAnswer = winner?.text ?? resolution
    }

    const needsAttention =
      !resolution && closeTime > 0 && now - closeTime > attentionThresholdMs

    const answers: Array<{ id: string; text: string; prob: number }> =
      (d.answers ?? []).map((a: { id: string; text: string; prob?: number }) => ({
        id: a.id,
        text: a.text,
        prob: a.prob ?? 0,
      }))

    return {
      id: d.id as string,
      question: d.question as string,
      closeTime,
      sportsStartTimestamp: (d.sportsStartTimestamp as string) ?? null,
      resolution,
      resolvedAnswer,
      resolutionTime: d.resolutionTime ? parseInt(d.resolutionTime, 10) : null,
      sportsHomeScore: d.sportsHomeScore != null ? (d.sportsHomeScore as number) : null,
      sportsAwayScore: d.sportsAwayScore != null ? (d.sportsAwayScore as number) : null,
      volume: d.volume ?? 0,
      url: `https://${ENV_CONFIG.domain}/${d.creatorUsername}/${d.slug}`,
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
