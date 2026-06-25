import { useEffect, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { useUnfilledBets } from 'client-common/hooks/use-bets'
import { flagImageCode } from 'common/sports'
import { ContractMetric } from 'common/contract-metric'
import { SportsBetPanel } from './sports-bet-panel'
import { Tooltip } from 'web/components/widgets/tooltip'
import {
  PositionsHovercard,
  PositionsData,
} from 'web/components/contract/positions-hovercard'
import { useUser } from 'web/hooks/use-user'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { api } from 'web/lib/api/api'
import { db } from 'web/lib/supabase/db'

// Renders a country flag as an image (works on every platform) rather than the
// regional-indicator emoji, which Windows/Chrome draw as bare letters ("KR").
// Falls back to the emoji for inputs we can't map (e.g. club tournaments, which
// pass no flag). The team name disambiguates UK home nations, which all share
// the GB flag emoji but have distinct flag images.
export function Flag({ emoji, name }: { emoji?: string; name?: string }) {
  const code = flagImageCode(emoji, name)
  const [failed, setFailed] = useState(false)
  // No mappable code, or the image failed to load → fall back to the emoji.
  if (!code || failed)
    return emoji ? (
      <span className="flex-shrink-0 text-base leading-none">{emoji}</span>
    ) : null
  return (
    <img
      src={`https://flagcdn.com/${code}.svg`}
      alt={code.toUpperCase()}
      title={code.toUpperCase()}
      onError={() => setFailed(true)}
      className="border-ink-200 h-3.5 w-5 flex-shrink-0 rounded-[2px] border object-cover"
      loading="lazy"
    />
  )
}

export type MatchOutcome = 'teamA' | 'teamB' | 'draw'

export const SPORTS_COLORS = {
  teamA: 'var(--sports-team-a)',
  teamB: 'var(--sports-team-b)',
  draw: 'var(--sports-draw)',
  teamAVibrant: 'var(--sports-team-a-vibrant)',
  teamBVibrant: 'var(--sports-team-b-vibrant)',
  drawVibrant: 'var(--sports-draw-vibrant)',
} as const

function vibrantForOutcome(
  outcome: MatchOutcome | undefined
): string | undefined {
  if (outcome === 'teamA') return SPORTS_COLORS.teamAVibrant
  if (outcome === 'teamB') return SPORTS_COLORS.teamBVibrant
  if (outcome === 'draw') return SPORTS_COLORS.drawVibrant
  return undefined
}

export type SportsMatch = {
  id: string
  question?: string
  teamA: { name: string; flag: string; prob: number }
  teamB: { name: string; flag: string; prob: number }
  draw: { prob: number }
  hasDraw?: boolean
  closeTime: string
  closeDateLabel: string
  closeTimeMs: number
  resolutionTime?: number | null
  volume: string
  status: 'upcoming' | 'resolved'
  winner?: MatchOutcome
  marketUrl?: string
  finalScore?: {
    home: number
    away: number
    duration?: string
    pens?: { home: number; away: number }
  }
  liveScore?: {
    home: number | null
    away: number | null
    minute: string | null
  }
  contractId?: string
  teamAAnswerId?: string
  teamBAnswerId?: string
  drawAnswerId?: string
}

function OutcomeRow({
  flag,
  name,
  prob,
  score,
  isWinner,
  isDraw,
  resolved,
  teamColor,
  winnerColor,
  onClick,
  hasPosition,
}: {
  flag?: string
  name: string
  prob: number
  score?: number
  isWinner?: boolean
  isDraw?: boolean
  resolved?: boolean
  teamColor?: string
  winnerColor?: string
  onClick?: () => void
  hasPosition?: boolean
}) {
  const clickable = !resolved && !!onClick

  return (
    <div
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      className={clsx(
        'relative flex items-center gap-2 overflow-hidden rounded-lg border-2 px-2 py-1.5 transition-colors',
        !resolved && 'cursor-pointer',
        !resolved && !isWinner && 'hover:bg-canvas-100'
      )}
      style={{
        borderColor:
          isWinner && winnerColor ? winnerColor : teamColor ?? undefined,
        backgroundColor:
          isWinner && winnerColor ? `${winnerColor}1F` : undefined,
      }}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-500"
        style={{
          width: `${prob}%`,
          backgroundColor: isWinner && winnerColor ? winnerColor : teamColor,
          opacity: 0.5,
        }}
      />
      {hasPosition && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-[5px]"
          style={{ backgroundColor: teamColor ?? undefined }}
        >
          <div
            className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
            style={{ backgroundColor: 'rgba(255,255,255,0.35)' }}
          />
        </div>
      )}
      <div className="relative z-10 flex w-full items-center gap-2">
        {isDraw ? (
          <div className="border-ink-300 bg-canvas-100 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border">
            <span
              className={clsx(
                'text-[8px] font-bold leading-none',
                !isWinner && 'text-ink-500'
              )}
              style={
                isWinner && winnerColor ? { color: winnerColor } : undefined
              }
            >
              –
            </span>
          </div>
        ) : (
          <Flag emoji={flag} name={name} />
        )}

        <span
          className={clsx(
            'flex-1 truncate',
            isWinner
              ? 'text-[14px] font-medium'
              : isDraw
              ? 'text-ink-500 text-xs'
              : 'text-ink-1000 text-[14px] font-medium'
          )}
          style={isWinner && winnerColor ? { color: winnerColor } : undefined}
        >
          {name}
          {isWinner && <span className="ml-1.5 text-xs">✓</span>}
        </span>

        {resolved ? (
          score !== undefined ? (
            <span
              className="text-sm font-semibold tabular-nums"
              style={{
                color: isWinner && winnerColor ? winnerColor : undefined,
              }}
            >
              {score}
            </span>
          ) : (
            <span
              className="text-xs font-medium"
              style={
                isWinner && winnerColor ? { color: winnerColor } : undefined
              }
            >
              {prob}%
            </span>
          )
        ) : (
          <span
            className="text-xs font-medium"
            style={isWinner && winnerColor ? { color: winnerColor } : undefined}
          >
            {prob}%
          </span>
        )}
      </div>
    </div>
  )
}

function useMyMatchMetrics(contractId: string | undefined) {
  const user = useUser()
  const [metrics, setMetrics] = useState<ContractMetric[] | undefined>(
    undefined
  )

  useEffect(() => {
    if (!user?.id || !contractId) {
      setMetrics(undefined)
      return
    }
    db.from('user_contract_metrics')
      .select('data')
      .eq('contract_id', contractId)
      .eq('user_id', user.id)
      .then(({ data }) => {
        setMetrics((data ?? []).map((row) => row.data as ContractMetric))
      })
  }, [user?.id, contractId])

  useApiSubscription({
    topics:
      contractId && user?.id
        ? [`contract/${contractId}/user-metrics/${user.id}`]
        : [],
    enabled: !!user?.id && !!contractId,
    onBroadcast: ({ data }) => {
      const updated = data.metrics as ContractMetric[]
      if (updated?.length) {
        setMetrics((prev) => {
          const map = new Map((prev ?? []).map((m) => [m.answerId, m]))
          updated.forEach((m) => map.set(m.answerId, m))
          return Array.from(map.values())
        })
      }
    },
  })

  return metrics
}

function stripEmoji(str: string): string {
  return str
    .replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '')
    .trim()
}

export function SportsMatchCard({ match }: { match: SportsMatch }) {
  const resolved = match.status === 'resolved'
  const now = Date.now()
  const user = useUser()
  const myMetrics = useMyMatchMetrics(!resolved ? match.contractId : undefined)
  const allLimitBets = useUnfilledBets(
    match.contractId ?? '',
    (params) => api('bets', params),
    useIsPageVisible,
    { enabled: !resolved && !!user && !!match.contractId }
  )
  // Live state is data-driven (a fresh in-play score), not a fixed time window —
  // so a long match never falsely reverts to "Upcoming". Seeded from the initial
  // fetch, then updated live over the websocket below.
  const [liveScore, setLiveScore] = useState(match.liveScore)
  useEffect(() => {
    setLiveScore(match.liveScore)
  }, [
    match.liveScore?.home,
    match.liveScore?.away,
    match.liveScore?.minute,
    match.id,
  ])

  useApiSubscription({
    topics: match.contractId
      ? [`contract/${match.contractId}/sports-live`]
      : [],
    enabled: !resolved && !!match.contractId,
    onBroadcast: ({ data }) => {
      const status = data.sportsLiveStatus as string | undefined
      if (status === 'IN_PLAY' || status === 'PAUSED') {
        setLiveScore({
          home: (data.sportsHomeScore as number | null) ?? null,
          away: (data.sportsAwayScore as number | null) ?? null,
          minute: (data.sportsLiveMinute as string | null) ?? null,
        })
      } else {
        setLiveScore(undefined)
      }
    },
  })

  const live = !resolved ? liveScore : undefined
  const isLive = !!live
  const pastKickoff = !resolved && match.closeTimeMs <= now
  const homeScore = resolved ? match.finalScore?.home : undefined
  const awayScore = resolved ? match.finalScore?.away : undefined
  const winnerColor = resolved ? vibrantForOutcome(match.winner) : undefined
  const marketHref = match.marketUrl ?? '#'
  const myLimitBets = (allLimitBets ?? []).filter((b) => b.userId === user?.id)
  const teamAPos =
    !resolved &&
    myMetrics?.find((m) => m.answerId === match.teamAAnswerId && m.hasShares)
  const teamBPos =
    !resolved &&
    myMetrics?.find((m) => m.answerId === match.teamBAnswerId && m.hasShares)
  const drawPos =
    !resolved &&
    myMetrics?.find((m) => m.answerId === match.drawAnswerId && m.hasShares)
  const positions: PositionsData['positions'] = [
    ...(teamAPos
      ? [
          {
            name: match.teamA.name,
            color: SPORTS_COLORS.teamA,
            amount: teamAPos.invested,
            profit: teamAPos.profit,
          },
        ]
      : []),
    ...(teamBPos
      ? [
          {
            name: match.teamB.name,
            color: SPORTS_COLORS.teamB,
            amount: teamBPos.invested,
            profit: teamBPos.profit,
          },
        ]
      : []),
    ...(drawPos
      ? [
          {
            name: 'Draw',
            color: SPORTS_COLORS.draw,
            amount: drawPos.invested,
            profit: drawPos.profit,
          },
        ]
      : []),
  ]
  const limitOrders: PositionsData['limitOrders'] =
    !resolved && user
      ? myLimitBets
          .filter((b) => !!b.answerId)
          .map((b) => {
            const name =
              b.answerId === match.teamAAnswerId
                ? match.teamA.name
                : b.answerId === match.teamBAnswerId
                ? match.teamB.name
                : b.answerId === match.drawAnswerId
                ? 'Draw'
                : null
            return name
              ? {
                  name,
                  prob: Math.round(b.limitProb * 100),
                  amount: b.orderAmount - b.amount,
                }
              : null
          })
          .filter((o): o is NonNullable<typeof o> => o !== null)
      : []
  const userData: PositionsData = { positions, limitOrders }
  const hasPositions = userData.positions.length > 0
  const hasOrders = userData.limitOrders.length > 0
  const hasAny = hasPositions || hasOrders
  const LIVE_COLOR = '#16a34a'

  // Annotate how a knockout was decided so the fullTime score (which can be a
  // draw) doesn't read as contradicting the advancing team.
  const finalLabel =
    match.finalScore?.duration === 'PENALTY_SHOOTOUT'
      ? match.finalScore.pens
        ? `Final · ${match.finalScore.pens.home}–${match.finalScore.pens.away} pens`
        : 'Final · pens'
      : match.finalScore?.duration === 'EXTRA_TIME'
      ? 'Final · AET'
      : 'Final'

  const [betOutcome, setBetOutcome] = useState<MatchOutcome | null>(null)

  // Live odds: subscribe to this market's answer updates so probabilities move
  // in real time as people bet — no polling, no per-viewer DB load (in-memory
  // websocket fan-out). Odds tend to front-run the (polled) score, so this is
  // the fast signal during a match.
  const [probs, setProbs] = useState({
    teamA: match.teamA.prob,
    teamB: match.teamB.prob,
    draw: match.draw.prob,
  })
  useEffect(() => {
    setProbs({
      teamA: match.teamA.prob,
      teamB: match.teamB.prob,
      draw: match.draw.prob,
    })
  }, [match.teamA.prob, match.teamB.prob, match.draw.prob])

  useApiSubscription({
    topics: match.contractId
      ? [`contract/${match.contractId}/updated-answers`]
      : [],
    enabled: !resolved && !!match.contractId,
    onBroadcast: ({ data }) => {
      const updates = (data.answers ?? []) as Array<{
        id: string
        prob?: number
      }>
      setProbs((prev) => {
        const next = { ...prev }
        for (const u of updates) {
          if (u.prob == null) continue
          const pct = Math.round(u.prob * 100)
          if (u.id === match.teamAAnswerId) next.teamA = pct
          else if (u.id === match.teamBAnswerId) next.teamB = pct
          else if (u.id === match.drawAnswerId) next.draw = pct
        }
        return next
      })
    },
  })

  return (
    <>
      <div
        className={clsx(
          'bg-canvas-50 border-ink-200 flex flex-col gap-2.5 rounded-xl border p-[18px] transition-colors',
          resolved ? 'opacity-70' : 'hover:border-ink-300'
        )}
      >
        {/* Market title — links to the market page */}
        {match.question && (
          <Link
            href={marketHref}
            className="text-ink-900 hover:text-primary-600 line-clamp-2 text-[15px] font-semibold leading-snug transition-colors"
          >
            {stripEmoji(match.question)}
          </Link>
        )}

        <Row className="justify-between">
          {isLive ? (
            <span
              className="text-[11px] font-medium"
              style={{ color: LIVE_COLOR }}
            >
              {`● Live${
                live?.minute
                  ? `  ${live.minute === 'HT' ? 'HT' : `${live.minute}'`}`
                  : ''
              }`}
            </span>
          ) : (
            <span className="text-ink-500 text-[11px]">
              {resolved
                ? match.closeDateLabel
                : pastKickoff
                ? `Kicked off ${match.closeTime}`
                : `Kickoff ${match.closeTime}`}
            </span>
          )}
          {isLive && live && live.home != null && live.away != null ? (
            <span
              className="text-[11px] font-semibold tabular-nums"
              style={{ color: LIVE_COLOR }}
            >
              {live.home} – {live.away}
            </span>
          ) : isLive ? (
            <span
              className="text-[11px] font-medium"
              style={{ color: LIVE_COLOR }}
            >
              In progress
            </span>
          ) : (
            <span
              className="text-[11px] font-medium"
              style={{ color: winnerColor ?? '#6B7280' }}
            >
              {resolved
                ? finalLabel
                : pastKickoff
                ? 'Awaiting result'
                : 'Upcoming'}
            </span>
          )}
        </Row>

        <Col className="gap-1">
          <OutcomeRow
            flag={match.teamA.flag}
            name={match.teamA.name}
            prob={probs.teamA}
            score={homeScore}
            isWinner={resolved && match.winner === 'teamA'}
            resolved={resolved}
            teamColor={SPORTS_COLORS.teamA}
            winnerColor={match.winner === 'teamA' ? winnerColor : undefined}
            onClick={!resolved ? () => setBetOutcome('teamA') : undefined}
            hasPosition={userData.positions.some(
              (p) => p.name === match.teamA.name
            )}
          />
          <OutcomeRow
            flag={match.teamB.flag}
            name={match.teamB.name}
            prob={probs.teamB}
            score={awayScore}
            isWinner={resolved && match.winner === 'teamB'}
            resolved={resolved}
            teamColor={SPORTS_COLORS.teamB}
            winnerColor={match.winner === 'teamB' ? winnerColor : undefined}
            onClick={!resolved ? () => setBetOutcome('teamB') : undefined}
            hasPosition={userData.positions.some(
              (p) => p.name === match.teamB.name
            )}
          />
          {(match.hasDraw ?? true) && (
            <OutcomeRow
              name="Draw"
              prob={probs.draw}
              isWinner={resolved && match.winner === 'draw'}
              isDraw
              resolved={resolved}
              teamColor={SPORTS_COLORS.draw}
              winnerColor={match.winner === 'draw' ? winnerColor : undefined}
              onClick={!resolved ? () => setBetOutcome('draw') : undefined}
              hasPosition={userData.positions.some((p) => p.name === 'Draw')}
            />
          )}
        </Col>

        <Row className="border-ink-200 items-center justify-between border-t pt-2">
          <span className="text-ink-500 text-[11px]">Ṁ {match.volume} vol</span>
          {hasAny && (
            <Tooltip
              text={
                <Link href={marketHref} className="block">
                  <PositionsHovercard {...userData} />
                </Link>
              }
              placement="top"
              hasSafePolygon
              tooltipClassName="!bg-canvas-20 border-ink-200 border shadow-lg !text-left !max-w-none !px-3 !py-2.5 !rounded-lg"
            >
              <Link
                href={marketHref}
                className="text-ink-500 hover:text-ink-700 flex items-center gap-1.5 text-[11px] transition-colors"
              >
                {hasPositions && (
                  <span className="bg-ink-400 h-2 w-2 rounded-full" />
                )}
                {hasOrders && (
                  <span className="border-ink-600 h-2 w-2 rounded-full border" />
                )}
                <span>Positions</span>
              </Link>
            </Tooltip>
          )}
          <Link
            href={marketHref}
            className="text-ink-500 hover:text-yes-500 text-[11px] transition-colors"
          >
            View market →
          </Link>
        </Row>
      </div>

      {betOutcome && (
        <SportsBetPanel
          match={{
            ...match,
            teamA: { ...match.teamA, prob: probs.teamA },
            teamB: { ...match.teamB, prob: probs.teamB },
            draw: { prob: probs.draw },
            liveScore,
          }}
          initialOutcome={betOutcome}
          onClose={() => setBetOutcome(null)}
        />
      )}
    </>
  )
}

export function PastMatchCard({ match }: { match: SportsMatch }) {
  const winnerName =
    match.winner === 'teamA'
      ? match.teamA.name
      : match.winner === 'teamB'
      ? match.teamB.name
      : 'Draw'

  return (
    <Link
      href={match.marketUrl ?? '#'}
      className="bg-canvas-0 border-ink-200 hover:border-ink-300 flex items-center justify-between rounded-lg border px-3.5 py-2.5 opacity-60 transition-colors"
    >
      <Col className="gap-0.5">
        <span className="text-ink-900 text-sm">
          {match.teamA.name} vs {match.teamB.name}
        </span>
        <span className="text-ink-500 text-[11px]">
          {match.closeDateLabel} · ✓ {winnerName}
        </span>
      </Col>
      <span className="text-ink-500 text-[11px]">View →</span>
    </Link>
  )
}

export function SportsDashboardTabButton({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean
  count?: number
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        // Compact on mobile so the header button row fits on one line.
        'flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm',
        active
          ? 'border-ink-700 text-ink-1000 border-2'
          : 'border-ink-300 text-ink-500 hover:border-ink-400 hover:text-ink-700 border'
      )}
    >
      {children}
      {count !== undefined && (
        <span
          className={clsx(
            'rounded-full px-1 py-0.5 text-[10px] font-semibold sm:px-1.5 sm:text-xs',
            active
              ? 'bg-primary-100 text-primary-600'
              : 'bg-ink-100 text-ink-500'
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}
