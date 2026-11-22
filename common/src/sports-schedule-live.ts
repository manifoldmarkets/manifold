import {
  ScheduleGame,
  SportsScheduleResponse,
  LIVE_STATUSES,
  LIVE_STALE_MS,
  TERMINAL_STATUSES,
  gameStatus,
  atSportsObservationTime,
  sportsGameBinding,
  sportsLiveEnd,
  sportsMembershipEnd,
  AnySportKey,
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
    terminalPair?: { home: number | null; away: number | null }
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
    ...(TERMINAL_STATUSES.has(status) && {
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
        finalScore:
          terminalPair && terminalPair.home != null && terminalPair.away != null
            ? { home: terminalPair.home, away: terminalPair.away }
            : score.finalScore ?? null,
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

type RailSource = Pick<
  SportsScheduleResponse,
  | 'snapshotTime'
  | 'counts'
  | 'liveCount'
  | 'liveExpiries'
  | 'membershipExpiries'
>

export const sportsRailEntry = (g: ScheduleGame) => ({
  sport: g.sport,
  status: g.status,
  liveUntil: sportsLiveEnd(g),
  memberUntil: sportsMembershipEnd(g),
})
type RailEntry = ReturnType<typeof sportsRailEntry>
type RailChange = { before: RailEntry; after: RailEntry; at: number }
type CensusSource = RailSource & Pick<SportsScheduleResponse, 'sports'>
export type SportsCensus = {
  source: CensusSource
  changes: Record<string, RailChange>
}

/** A cached sport contributes only newer, fixture-bound changes. Its older
 * global totals can never displace the last successful census from any view. */
export function reconcileSportsCensus(
  previous: SportsCensus | undefined,
  source: CensusSource,
  before: ScheduleGame[],
  after: ScheduleGame[]
): SportsCensus {
  const readAt = source.snapshotTime ?? 0
  const fresh = !previous || readAt > (previous.source.snapshotTime ?? 0)
  const base = fresh
    ? {
        sports: source.sports,
        counts: source.counts,
        liveCount: source.liveCount,
        snapshotTime: source.snapshotTime,
        liveExpiries: source.liveExpiries,
        membershipExpiries: source.membershipExpiries,
      }
    : previous.source
  let next = fresh
    ? {
        source: base,
        changes: Object.fromEntries(
          Object.entries(previous?.changes ?? {}).filter(
            ([, change]) => change.at > readAt
          )
        ),
      }
    : previous
  for (let i = 0; i < before.length; i++) {
    const original = before[i],
      displayed = after[i],
      at = displayed.liveUpdatedTime ?? 0
    if (
      at <= (original.liveUpdatedTime ?? 0) ||
      at <= (next.changes[original.id]?.at ?? 0) ||
      (readAt < (base.snapshotTime ?? 0) && at <= (base.snapshotTime ?? 0))
    )
      continue
    if (next === previous)
      next = { source: base, changes: { ...previous.changes } }
    next.changes[original.id] = {
      before: next.changes[original.id]?.before ?? sportsRailEntry(original),
      after: sportsRailEntry(displayed),
      at,
    }
  }
  return next
}

export function displaySportsCensus(census: SportsCensus, now: number) {
  return {
    ...census.source,
    ...projectEntries(census.source, Object.values(census.changes), now),
  }
}

function projectEntries(
  source: RailSource,
  changes: { before: RailEntry; after: RailEntry }[],
  now: number
) {
  const fallbackEnd = (source.snapshotTime ?? 0) + LIVE_STALE_MS
  const deadlines = new Map<number, number>()
  const memberships = new Map<AnySportKey, Map<number, number>>()
  const add = (map: Map<number, number>, at: number | undefined, n: number) => {
    if (at != null && at > now) map.set(at, (map.get(at) ?? 0) + n)
  }
  const addMembership = (sport: AnySportKey, at: number, n: number) => {
    const perSport = memberships.get(sport) ?? new Map<number, number>()
    add(perSport, at, n)
    memberships.set(sport, perSport)
  }
  let liveCount = source.liveCount
  const counts = { ...source.counts }
  for (const [at, n] of source.liveExpiries ?? [[fallbackEnd, liveCount]]) {
    if (at <= now) liveCount -= n
    else add(deadlines, at, n)
  }
  for (const [at, sport, n] of source.membershipExpiries ?? []) {
    if (at <= now) counts[sport] = (counts[sport] ?? 0) - n
    else addMembership(sport, at, n)
  }
  changes.forEach(({ before: original, after: displayed }) => {
    const liveEnd = source.liveExpiries ? original.liveUntil : fallbackEnd
    const originallyLive =
      original.status === 'live' && (liveEnd == null || liveEnd > now)
    const originallyVisible =
      original.status !== 'finished' &&
      (!source.membershipExpiries || original.memberUntil > now)
    if (originallyLive) {
      liveCount--
      add(deadlines, liveEnd, -1)
    }
    if (originallyVisible) {
      counts[original.sport] = (counts[original.sport] ?? 0) - 1
      if (source.membershipExpiries)
        addMembership(original.sport, original.memberUntil, -1)
    }
    if (displayed.status !== 'finished' && displayed.memberUntil > now) {
      counts[displayed.sport] = (counts[displayed.sport] ?? 0) + 1
      addMembership(displayed.sport, displayed.memberUntil, 1)
      if (
        displayed.status === 'live' &&
        (displayed.liveUntil == null || displayed.liveUntil > now)
      ) {
        liveCount++
        add(deadlines, displayed.liveUntil, 1)
      }
    }
  })
  for (const sport of Object.keys(counts))
    counts[sport] = Math.max(0, counts[sport] ?? 0)
  const membershipExpiries: NonNullable<RailSource['membershipExpiries']> = []
  for (const [sport, map] of memberships)
    for (const [at, n] of map)
      if (n > 0) membershipExpiries.push([at, sport, n])
  return {
    counts,
    liveCount: Math.max(0, liveCount),
    liveExpiries: [...deadlines].filter(([, n]) => n > 0),
    membershipExpiries,
  }
}
