import {
  ScheduleGame,
  SportsScheduleResponse,
  LIVE_STATUSES,
  LIVE_STALE_MS,
  TERMINAL_STATUSES,
  gameStatus,
  atSportsObservationTime,
  sportsGameBinding,
} from './sports-schedule'
import {
  publicSportsScoreSchema,
  legacySportsScoreSchema,
  scheduleScoreFields,
  ScheduleScoreFields,
} from './sports-scoreboard'

/** Times come from the server, never the browser's arrival clock. */
export type Stamped<T> = { value: T; at: number }
export type LiveGameState = {
  /** Schedule binding under which the websocket observation was acquired. */
  binding?: string
  probs?: Record<string, Stamped<number>>
  liveScore?: Stamped<ScheduleGame['liveScore']> & {
    status: string
    scoreUpdatedTime?: number | null
    terminalPair?: ScheduleGame['finalScore']
    fields?: ScheduleScoreFields
    finalScore?: ScheduleGame['finalScore']
  }
}

export type SportsScoreTick = NonNullable<LiveGameState['liveScore']>

/** Interpret one complete public score observation. Its receipt orders it against snapshots. */
export function decodeSportsScoreTick(
  raw: unknown,
  bdlEnabled = true
): SportsScoreTick | undefined {
  const schema = bdlEnabled ? publicSportsScoreSchema : legacySportsScoreSchema
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return
  const score = parsed.data
  const {
    sportsHomeScore: home,
    sportsAwayScore: away,
    sportsLiveStatus: status,
  } = score
  if (!bdlEnabled) {
    return {
      at: score.sportsLiveUpdatedTime,
      scoreUpdatedTime: score.sportsScoreUpdatedTime ?? null,
      status,
      value: LIVE_STATUSES.has(status)
        ? { home, away, minute: score.sportsLiveMinute, status }
        : null,
    }
  }
  const fields = scheduleScoreFields(score, false)
  const showScore =
    LIVE_STATUSES.has(status) ||
    fields.gameState === 'live' ||
    fields.gameState === 'settling' ||
    fields.gameState === 'suspended'
  const hasFinal =
    fields.gameState === 'settling' && home != null && away != null
  return {
    at: score.sportsLiveUpdatedTime,
    scoreUpdatedTime: score.sportsScoreUpdatedTime ?? null,
    status,
    fields,
    value: showScore
      ? {
          home,
          away,
          minute: score.sportsLiveMinute,
          status,
          ...(fields.period != null && { period: fields.period }),
          ...(fields.clock != null && { clock: fields.clock }),
        }
      : null,
    ...(TERMINAL_STATUSES.has(status) &&
      home != null &&
      away != null && {
        terminalPair: { home, away },
      }),
    finalScore: hasFinal ? { home, away } : null,
  }
}

export function newerSportsScoreTick(
  previous?: SportsScoreTick,
  incoming?: SportsScoreTick,
  bdlEnabled = true
) {
  return incoming &&
    (!previous ||
      incoming.at > previous.at ||
      (!bdlEnabled && incoming.at === previous.at))
    ? incoming
    : previous
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
    if (
      game?.isResolved ||
      (s.binding && game && s.binding !== sportsGameBinding(game))
    ) {
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
    const next: LiveGameState = { ...(s.binding && { binding: s.binding }) }
    if (Object.keys(probs).length > 0) next.probs = probs
    if (keepScore) next.liveScore = s.liveScore
    if (next.probs || next.liveScore) out[id] = next
  }
  return dropped ? out : state
}

export function applySportsLive(
  game: ScheduleGame,
  state?: LiveGameState,
  snapshotTime = 0,
  bdlEnabled = true,
  now = Date.now()
): ScheduleGame {
  // Applies during render too, before the pruning effect runs.
  if (
    !state ||
    game.isResolved ||
    (bdlEnabled && state.binding && state.binding !== sportsGameBinding(game))
  )
    return bdlEnabled ? atSportsObservationTime(game, now) : game
  const withProb = <T extends { answerId: string; prob: number }>(t: T): T => {
    const p = state.probs?.[t.answerId]
    return p && p.at > snapshotTime ? { ...t, prob: p.value } : t
  }
  const score =
    state.liveScore && state.liveScore.at > (game.liveUpdatedTime ?? 0)
      ? state.liveScore
      : undefined
  const terminalPair = game.sportsLeagueKey && score?.terminalPair
  const liveScore =
    terminalPair && score
      ? { ...terminalPair, status: score.status, minute: null }
      : score
      ? score.value
      : game.liveScore
  const gameState =
    score?.fields?.gameState ??
    (game.sportsLeagueKey && score
      ? TERMINAL_STATUSES.has(score.status)
        ? 'settling'
        : LIVE_STATUSES.has(score.status)
        ? 'live'
        : 'unavailable'
      : undefined)
  const updated: ScheduleGame = {
    ...game,
    home: withProb(game.home),
    away: withProb(game.away),
    draw: game.draw ? withProb(game.draw) : null,
    liveScore,
    liveUpdatedTime: score ? score.at : game.liveUpdatedTime,
    scoreUpdatedTime: score
      ? score.scoreUpdatedTime ?? null
      : game.scoreUpdatedTime,
    ...(!bdlEnabled && {
      status:
        score && TERMINAL_STATUSES.has(score.status)
          ? 'finished'
          : liveScore && game.status === 'upcoming'
          ? 'live'
          : game.status,
    }),
    ...(bdlEnabled &&
      score && {
        // Each push is a full observation. Dropping absent detail clears a prior
        // suspension, final or period after the provider corrects the state.
        gameState,
        observationStale: undefined,
        observedFinal:
          game.sportsLeagueKey &&
          /^(FINAL|FINISHED|AWARDED)$/i.test(score.status)
            ? true
            : undefined,
        period: score.fields?.period,
        clock: score.fields?.clock,
        scoreboard: score.fields?.scoreboard,
        resumptionTime: score.fields?.resumptionTime,
        finalQualifier: score.fields?.finalQualifier,
        finalScore: terminalPair || score.finalScore || null,
        status: gameStatus({
          ...game,
          gameState,
          liveStatus: score.status,
          liveUpdatedTime: score.at,
          now: score.at,
        }),
      }),
  }
  return bdlEnabled ? atSportsObservationTime(updated, now) : updated
}

/** Reconcile the global HTTP census with newer observations for the loaded rows.
 * Store only outstanding expiration counts so the rail also ages between views. */
export function projectSportsRail(
  source: SportsScheduleResponse,
  before: ScheduleGame[],
  after: ScheduleGame[],
  now: number
) {
  const fallbackEnd = (source.snapshotTime ?? 0) + LIVE_STALE_MS
  const deadlines = new Map<number, number>()
  const addDeadline = (at: number | undefined, count: number) => {
    if (at !== undefined && at > now)
      deadlines.set(at, (deadlines.get(at) ?? 0) + count)
  }
  let liveCount = source.liveCount
  for (const [at, count] of source.liveExpiries ?? [
    [fallbackEnd, source.liveCount],
  ]) {
    if (at <= now) liveCount -= count
    else addDeadline(at, count)
  }
  const counts = { ...source.counts }
  const receiptEnd = (game: ScheduleGame) =>
    game.sportsLeagueKey && game.liveUpdatedTime != null
      ? game.liveUpdatedTime + LIVE_STALE_MS
      : undefined
  before.forEach((game, i) => {
    const displayed = after[i]
    const wasLive = source.liveExpiries
      ? atSportsObservationTime(game, now).status === 'live'
      : now < fallbackEnd && game.status === 'live'
    if (wasLive) {
      liveCount--
      addDeadline(source.liveExpiries ? receiptEnd(game) : fallbackEnd, -1)
    }
    if (displayed.status === 'live') {
      liveCount++
      addDeadline(receiptEnd(displayed), 1)
    }
    if (game.status !== 'finished' && displayed.status === 'finished')
      counts[game.sport] = Math.max(0, (counts[game.sport] ?? 0) - 1)
  })
  return {
    counts,
    liveCount: Math.max(0, liveCount),
    liveExpiries: [...deadlines].filter(([, n]) => n > 0),
  }
}
