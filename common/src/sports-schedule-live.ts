import {
  ScheduleGame,
  SportsScheduleResponse,
  TERMINAL_STATUSES,
} from './sports-schedule'

/** Times come from the server, never the browser's arrival clock. */
export type Stamped<T> = { value: T; at: number }
export type LiveGameState = {
  probs?: Record<string, Stamped<number>>
  liveScore?: Stamped<ScheduleGame['liveScore']> & { status: string }
}

export function pruneSportsLive(
  state: Record<string, LiveGameState>,
  snapshot: SportsScheduleResponse
): Record<string, LiveGameState> {
  const games = new Map(snapshot.games.map((g) => [g.id, g]))
  const out: Record<string, LiveGameState> = {}
  let dropped = false
  for (const [id, s] of Object.entries(state)) {
    const game = games.get(id)
    if (game?.isResolved) {
      dropped = true
      continue
    }
    const probs: Record<string, Stamped<number>> = {}
    for (const [answerId, p] of Object.entries(s.probs ?? {})) {
      if (p.at > (snapshot.snapshotTime ?? 0)) probs[answerId] = p
      else dropped = true
    }
    // Scores have a persisted provider timestamp. Even a newly generated
    // response from a lagging replica must not replace a newer score.
    const keepScore =
      s.liveScore && s.liveScore.at > (game?.liveUpdatedTime ?? 0)
    if (s.liveScore && !keepScore) dropped = true
    const next: LiveGameState = {}
    if (Object.keys(probs).length > 0) next.probs = probs
    if (keepScore) next.liveScore = s.liveScore
    if (next.probs || next.liveScore) out[id] = next
  }
  return dropped ? out : state
}

export function applySportsLive(
  game: ScheduleGame,
  state?: LiveGameState,
  snapshotTime = 0
): ScheduleGame {
  // Applies during render too, before the pruning effect runs.
  if (!state || game.isResolved) return game
  const withProb = <T extends { answerId: string; prob: number }>(t: T): T => {
    const p = state.probs?.[t.answerId]
    return p && p.at > snapshotTime ? { ...t, prob: p.value } : t
  }
  const score =
    state.liveScore && state.liveScore.at > (game.liveUpdatedTime ?? 0)
      ? state.liveScore
      : undefined
  const liveScore = score ? score.value : game.liveScore
  return {
    ...game,
    home: withProb(game.home),
    away: withProb(game.away),
    draw: game.draw ? withProb(game.draw) : null,
    liveScore,
    status:
      score && TERMINAL_STATUSES.has(score.status)
        ? 'finished'
        : liveScore && game.status === 'upcoming'
        ? 'live'
        : game.status,
  }
}
