import { storedGameDayEnd } from 'common/bdl/game-day'
import { BDL_LEAGUES } from 'common/bdl/leagues'
import type { MajorLeague } from 'common/bdl/major-leagues'
import {
  BDL_OVERDUE_ALERT_MS,
  BDL_UNDATED_POSTPONEMENT_REVIEW_MS,
} from 'common/bdl/constants'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import {
  publicSportsScoreSchema,
  type SportsScoreboard,
} from 'common/sports-scoreboard'
import type { SportsLiveScore } from 'common/sports-schedule'
import { parseSportsKickoffMs } from 'common/sports-kickoff-interface'
import type { SportsKickoffSignal } from '../sports-kickoff-signal'
import type { MajorGame } from './major-games'
import {
  majorResultHash,
  matchesEntrants,
  reviewedResult,
  type MajorIncident,
  type MajorMarket,
  type MajorResult,
} from './major-result'

export type MajorPatch = Partial<SportsLiveScore> & {
  closeTime?: number
  question?: string
  sportsRecordedResult?: MajorResult | null
  sportsResultHash?: string | null
  sportsFinalSince?: number | null
  sportsCanceledSince?: number | null
  sportsPostponedSince?: number | null
  sportsStartTimestamp?: string
  sportsStartKnown?: boolean
  sportsObservedStartTime?: number
  sportsLastCheckedTime: number
  sportsLastSyncTime?: number
  sportsStandingsTeamIds?: string[] | null
  sportsAttentionReason?: MajorIncident | null
  sportsAttentionSince?: number | null
  sportsAttentionNotified?: true
  sportsLastWatchWarning?: number
  sportsHomeTeamCode?: string
  sportsAwayTeamCode?: string
  sportsVerification?: {
    source: string
    crossCheck: null
    verifiedTime: number
  }
}

const titleDay = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
})
function moveSchedule(
  m: MajorMarket,
  game: MajorGame,
  league: MajorLeague,
  at: number,
  patch: MajorPatch
) {
  if (!game.startTime) return
  const newStart = parseSportsKickoffMs(game.startTime)
  const prior = parseSportsKickoffMs(m.sportsStartTimestamp)
  if (
    !Number.isFinite(newStart) ||
    (newStart === prior && m.sportsStartKnown !== false)
  )
    return
  patch.sportsStartTimestamp = game.startTime
  patch.sportsStartKnown = true
  const config = BDL_LEAGUES[league]
  const buffer = config.closeAtStart ? 0 : config.closeBufferHours! * HOUR_MS
  // A custom close stays put, and an expired close is never reopened. A game already
  // observed in play can only move its close earlier, even after a postponement.
  const dateOnly = m.sportsStartKnown === false
  const latest = storedGameDayEnd(
    prior,
    dateOnly,
    m.sportsLatestPossibleStartTimestamp ?? null
  )
  if (m.closeTime && m.closeTime > at && m.closeTime === latest + buffer) {
    const target = newStart + buffer
    if (
      (!m.sportsObservedStartTime &&
        game.status !== 'in_progress' &&
        (m.sportsStartKnown === false || prior > at)) ||
      target < m.closeTime
    )
      patch.closeTime = target
  }
  if (Number.isFinite(prior)) {
    const prefix = m.sportsAwayTeam + ' at ' + m.sportsHomeTeam + ', '
    // A 50-hour bound is the original unknown-zone civil day. For narrower
    // bounds the venue zone was not persisted; keep its original title.
    if (dateOnly && latest - prior < 50 * HOUR_MS - 1) return
    const originalTitleTime = dateOnly ? prior + 26 * HOUR_MS : prior
    const previous = prefix + titleDay.format(originalTitleTime)
    if (m.question === previous || m.question === previous + ' (Game 2)')
      patch.question =
        prefix + titleDay.format(newStart) + m.question.slice(previous.length)
  }
}

function orderedDetail(detail: SportsScoreboard | undefined, flipped: boolean) {
  if (!detail || !flipped) return detail
  const swap = <T>(p: { home: T; away: T }) => ({ home: p.away, away: p.home })
  return {
    ...detail,
    ...(detail.periodScores && { periodScores: detail.periodScores.map(swap) }),
    ...(detail.shots && { shots: swap(detail.shots) }),
    ...(detail.redCards && { redCards: swap(detail.redCards) }),
    ...(detail.standings && {
      standings: { home: detail.standings.away, away: detail.standings.home },
    }),
  }
}

export type MajorChange = {
  patch: MajorPatch
  score?: SportsLiveScore
  record?: MajorResult
  alert?: MajorIncident
  signal?: SportsKickoffSignal['kind']
  suspendedWarning?: true
}

/** The caller applies this decision to the locked market used to make it. */
export function majorChange(
  m: MajorMarket,
  league: MajorLeague,
  game: MajorGame | undefined,
  at: number,
  flags: {
    replacement?: boolean
    conflictingSibling?: boolean
    sync?: boolean
  } = {}
): MajorChange {
  const patch: MajorPatch = { sportsLastCheckedTime: at }
  if (flags.sync) patch.sportsLastSyncTime = at
  const change: MajorChange = { patch }
  const settled = !!(m.resolution || m.isResolved)
  const decision = game ? reviewedResult(league, game) : {}
  let incident: MajorIncident | undefined
  if (flags.conflictingSibling) incident = 'conflicting sibling results'
  else if (
    !game &&
    (settled || parseSportsKickoffMs(m.sportsStartTimestamp) <= at)
  )
    incident = flags.replacement ? 'possible-reid' : 'missing game'
  else if (game && !matchesEntrants(m, game)) incident = 'unexpected entrants'
  else if (
    game?.status === 'final' &&
    parseSportsKickoffMs(game.startTime ?? m.sportsStartTimestamp) > at
  )
    incident = 'irregular result'
  else if (m.sportsRecordedResult?.status === 'final' && !decision.record)
    incident = 'result corrected'
  else incident = decision.incident
  if (settled) {
    if (
      !incident &&
      (!decision.record ||
        majorResultHash(decision.record) !== m.sportsResultHash)
    )
      incident = 'result corrected'
  } else {
    const firstSince = m.sportsFinalSince
    const hash = decision.record ? majorResultHash(decision.record) : null
    const same = hash !== null && hash === m.sportsResultHash
    if (game?.status === 'final' || game?.status === 'canceled') {
      if (m.closeTime === undefined || m.closeTime > at) patch.closeTime = at
    }
    if (incident) {
      const score: SportsLiveScore = {
        sportsHomeScore: null,
        sportsAwayScore: null,
        sportsLiveStatus:
          game?.status === 'abandoned' ? 'ABANDONED' : 'UNKNOWN',
        sportsLiveMinute: null,
        sportsLiveUpdatedTime: at,
        sportsScoreUpdatedTime: null,
        sportsLivePeriod: null,
        sportsLiveClock: null,
        sportsLiveDetail: null,
        sportsFinalQualifier: null,
        sportsResumptionTime: null,
      }
      Object.assign(patch, score)
      change.score = score
    }
    if (!incident && game) {
      const flipped = String(game.home.id) !== m.sportsHomeTeamId
      const scheduled = game.status === 'scheduled'
      let detail = orderedDetail(game.detail, flipped)
      if (detail?.standings && m.sportsHomeTeamId && m.sportsAwayTeamId) {
        patch.sportsStandingsTeamIds = [m.sportsHomeTeamId, m.sportsAwayTeamId]
      } else if (
        !flags.sync &&
        m.sportsStandingsTeamIds?.[0] === m.sportsHomeTeamId &&
        m.sportsStandingsTeamIds?.[1] === m.sportsAwayTeamId &&
        m.sportsLiveDetail?.standings
      ) {
        // Stored standings are already oriented to the market's original home/away teams.
        const prior = publicSportsScoreSchema.shape.sportsLiveDetail.safeParse({
          standings: m.sportsLiveDetail.standings,
        })
        if (prior.success && prior.data?.standings)
          detail = { ...detail, standings: prior.data.standings }
      } else patch.sportsStandingsTeamIds = null
      const reportedStart = parseSportsKickoffMs(game.startTime ?? undefined)
      const prior = parseSportsKickoffMs(m.sportsStartTimestamp)
      const resume =
        game.resumptionTime ??
        (game.status === 'suspended' &&
        reportedStart > at &&
        (reportedStart !== prior || reportedStart === m.sportsResumptionTime)
          ? reportedStart
          : undefined)
      const score: SportsLiveScore = {
        sportsHomeScore: scheduled
          ? null
          : flipped
          ? game.awayScore
          : game.homeScore,
        sportsAwayScore: scheduled
          ? null
          : flipped
          ? game.homeScore
          : game.awayScore,
        sportsLiveStatus: game.status.toUpperCase(),
        sportsLiveMinute: null,
        sportsLiveUpdatedTime: at,
        sportsScoreUpdatedTime: game.scoreUpdatedTime ?? null,
        sportsLivePeriod: game.period ?? null,
        sportsLiveClock: game.clock ?? null,
        sportsFinalQualifier: game.finalQualifier ?? null,
        sportsResumptionTime: resume ?? null,
        sportsLiveDetail: detail ?? null,
      }
      Object.assign(patch, score)
      change.score = score
      const home = flipped ? game.away : game.home,
        away = flipped ? game.home : game.away
      if (home.code) patch.sportsHomeTeamCode = home.code
      if (away.code) patch.sportsAwayTeamCode = away.code
      if (game.status === 'in_progress' && !m.sportsObservedStartTime)
        patch.sportsObservedStartTime = at
      if (game.status !== 'final' && game.status !== 'canceled')
        moveSchedule(m, game, league, at, patch)
      const postponed = ['suspended', 'delayed', 'postponed'].includes(
        game.status
      )
      patch.sportsPostponedSince = postponed
        ? m.sportsPostponedSince ?? at
        : null
      const nextTime =
        game.status === 'suspended'
          ? resume ?? NaN
          : game.resumptionTime ?? reportedStart
      const hasFuture = Number.isFinite(nextTime) && nextTime > at
      if (
        postponed &&
        !hasFuture &&
        at - patch.sportsPostponedSince! >= BDL_UNDATED_POSTPONEMENT_REVIEW_MS
      )
        incident = 'unconfirmed resumption'
      if (league === 'mlb' && game.status === 'suspended' && hasFuture) {
        if (
          !m.sportsLastWatchWarning ||
          at - m.sportsLastWatchWarning >= DAY_MS
        ) {
          patch.sportsLastWatchWarning = at
          change.suspendedWarning = true
        }
      } else if (
        !postponed &&
        !decision.record &&
        m.closeTime &&
        at - m.closeTime >= BDL_OVERDUE_ALERT_MS
      )
        incident = 'overdue final'
    }
    // A gap in positive terminal observations breaks the cancellation hold.
    patch.sportsRecordedResult =
      !incident && decision.record ? decision.record : null
    patch.sportsResultHash = patch.sportsRecordedResult ? hash : null
    patch.sportsFinalSince =
      patch.sportsRecordedResult?.status === 'final'
        ? same
          ? firstSince ?? at
          : at
        : null
    patch.sportsCanceledSince =
      patch.sportsRecordedResult?.status === 'canceled'
        ? same
          ? m.sportsCanceledSince ?? at
          : at
        : null
    if (patch.sportsRecordedResult) {
      change.record = patch.sportsRecordedResult
      patch.sportsVerification = {
        source: 'bdl',
        crossCheck: null,
        verifiedTime: at,
      }
      if (m.sportsResultHash && !same) incident = 'result corrected'
    }
    if (
      m.sportsAttentionReason === 'result corrected' ||
      m.sportsAttentionReason === 'conflicting sibling results'
    )
      incident = m.sportsAttentionReason
  }
  if (!settled) {
    if (patch.sportsObservedStartTime) change.signal = 'started'
    else if (!game && !m.sportsAttentionReason && incident)
      change.signal = 'missing'
    else if (game?.status === 'canceled' && !m.sportsCanceledSince)
      change.signal = 'canceled'
    else if (patch.sportsPostponedSince === at && !m.sportsPostponedSince)
      change.signal = 'postponed'
    else if (
      patch.sportsStartTimestamp &&
      parseSportsKickoffMs(patch.sportsStartTimestamp) <
        parseSportsKickoffMs(m.sportsStartTimestamp)
    )
      change.signal = 'moved-earlier'
  }
  if (incident) {
    patch.sportsAttentionReason = incident
    patch.sportsAttentionSince =
      m.sportsAttentionReason === incident ? m.sportsAttentionSince ?? at : at
    if (!m.sportsAttentionNotified) {
      patch.sportsAttentionNotified = true
      change.alert = incident
    }
    delete change.record
  } else if (!settled && m.sportsAttentionReason) {
    patch.sportsAttentionReason = null
    patch.sportsAttentionSince = null
  }
  return change
}
