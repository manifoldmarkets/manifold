import Link from 'next/link'
import { useRouter } from 'next/router'
import clsx from 'clsx'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'

export type MatchOutcome = 'teamA' | 'teamB' | 'draw'

export const SPORTS_COLORS = {
  teamA: 'var(--sports-team-a)',
  teamB: 'var(--sports-team-b)',
  draw: 'var(--sports-draw)',
  teamAVibrant: 'var(--sports-team-a-vibrant)',
  teamBVibrant: 'var(--sports-team-b-vibrant)',
  drawVibrant: 'var(--sports-draw-vibrant)',
} as const

function vibrantForOutcome(outcome: MatchOutcome | undefined): string | undefined {
  if (outcome === 'teamA') return SPORTS_COLORS.teamAVibrant
  if (outcome === 'teamB') return SPORTS_COLORS.teamBVibrant
  if (outcome === 'draw') return SPORTS_COLORS.drawVibrant
  return undefined
}

export type SportsMatch = {
  id: string
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
  finalScore?: { home: number; away: number }
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
  isFirstTeam,
  resolved,
  teamColor,
  winnerColor,
  onClick,
}: {
  flag?: string
  name: string
  prob: number
  score?: number
  isWinner?: boolean
  isDraw?: boolean
  isFirstTeam?: boolean
  resolved?: boolean
  teamColor?: string
  winnerColor?: string
  onClick?: () => void
}) {
  const barColor = isWinner
    ? 'bg-green-400'
    : isDraw
    ? 'bg-ink-400'
    : isFirstTeam
    ? 'bg-yes-500'
    : 'bg-no-500'

  return (
    <div
      onClick={!resolved ? onClick : undefined}
      className={clsx(
        'flex items-center gap-2 rounded-lg border-2 px-2 py-1.5 transition-colors',
        !resolved && 'cursor-pointer',
        !resolved && !isWinner && 'hover:bg-canvas-100'
      )}
      style={{
        borderColor: isWinner && winnerColor ? winnerColor : teamColor ?? undefined,
        backgroundColor: isWinner && winnerColor ? `${winnerColor}1F` : undefined,
      }}
    >
      {isDraw ? (
        <div className="border-ink-300 bg-canvas-100 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border">
          <span
            className={clsx('text-[8px] font-bold leading-none', !isWinner && 'text-ink-500')}
            style={isWinner && winnerColor ? { color: winnerColor } : undefined}
          >
            –
          </span>
        </div>
      ) : (
        <span className="flex-shrink-0 text-base leading-none">{flag}</span>
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
            style={{ color: isWinner && winnerColor ? winnerColor : undefined }}
          >
            {score}
          </span>
        ) : (
          <span
            className="text-xs font-medium"
            style={isWinner && winnerColor ? { color: winnerColor } : undefined}
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
  )
}

export function SportsMatchCard({ match }: { match: SportsMatch }) {
  const router = useRouter()
  const resolved = match.status === 'resolved'
  const now = Date.now()
  const isLive = !resolved && match.closeTimeMs <= now && now - match.closeTimeMs < 2.5 * 60 * 60 * 1000
  const homeScore = resolved ? match.finalScore?.home : undefined
  const awayScore = resolved ? match.finalScore?.away : undefined
  const winnerColor = resolved ? vibrantForOutcome(match.winner) : undefined
  const marketHref = match.marketUrl ?? '#'

  return (
    <div
      className={clsx(
        'bg-canvas-50 border-ink-200 flex flex-col gap-2.5 rounded-xl border p-[18px] transition-colors',
        resolved ? 'opacity-70' : 'hover:border-ink-300'
      )}
    >
      <Row className="justify-between">
        <span className="text-ink-500 text-[11px]">
          {resolved
            ? match.closeDateLabel
            : isLive
            ? `Kicked off ${match.closeTime}`
            : `Kickoff ${match.closeTime}`}
        </span>
        <span
          className="text-[11px] font-medium"
          style={{ color: winnerColor ?? '#6B7280' }}
        >
          {resolved ? 'Final' : isLive ? 'Awaiting result' : 'Upcoming'}
        </span>
      </Row>

      <Col className="gap-1">
        <OutcomeRow
          flag={match.teamA.flag}
          name={match.teamA.name}
          prob={match.teamA.prob}
          score={homeScore}
          isWinner={resolved && match.winner === 'teamA'}
          isFirstTeam
          resolved={resolved}
          teamColor={SPORTS_COLORS.teamA}
          winnerColor={match.winner === 'teamA' ? winnerColor : undefined}
          onClick={() => router.push(marketHref)}
        />
        <OutcomeRow
          flag={match.teamB.flag}
          name={match.teamB.name}
          prob={match.teamB.prob}
          score={awayScore}
          isWinner={resolved && match.winner === 'teamB'}
          resolved={resolved}
          teamColor={SPORTS_COLORS.teamB}
          winnerColor={match.winner === 'teamB' ? winnerColor : undefined}
          onClick={() => router.push(marketHref)}
        />
        {(match.hasDraw ?? true) && (
          <OutcomeRow
            name="Draw"
            prob={match.draw.prob}
            isWinner={resolved && match.winner === 'draw'}
            isDraw
            resolved={resolved}
            teamColor={SPORTS_COLORS.draw}
            winnerColor={match.winner === 'draw' ? winnerColor : undefined}
            onClick={() => router.push(marketHref)}
          />
        )}
      </Col>

      <Row className="border-ink-200 justify-between border-t pt-2">
        <span className="text-ink-500 text-[11px]">Ṁ {match.volume} vol</span>
        <Link
          href={marketHref}
          className="text-ink-500 hover:text-yes-500 text-[11px] transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          View market →
        </Link>
      </Row>
    </div>
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
        'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-ink-700 text-ink-1000 border-2'
          : 'border-ink-300 text-ink-500 hover:border-ink-400 hover:text-ink-700 border'
      )}
    >
      {children}
      {count !== undefined && (
        <span
          className={clsx(
            'rounded-full px-1.5 py-0.5 text-xs font-semibold',
            active ? 'bg-primary-100 text-primary-600' : 'bg-ink-100 text-ink-500'
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}
