import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import clsx from 'clsx'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { flagEmojiToCode } from 'common/sports'
import { CPMMMultiContract } from 'common/contract'
import { Answer } from 'common/answer'
import { getContract, getAnswersForContracts } from 'common/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import {
  Modal,
  MODAL_CLASS,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import { AnswerCpmmBetPanel } from 'web/components/answers/answer-bet-panel'

// Renders a country flag as an image (works on every platform) rather than the
// regional-indicator emoji, which Windows/Chrome draw as bare letters ("KR").
// Falls back to the emoji for inputs we can't map (e.g. club tournaments, which
// pass no flag).
export function Flag({ emoji }: { emoji?: string }) {
  const code = emoji ? flagEmojiToCode(emoji) : ''
  if (!code)
    return emoji ? (
      <span className="flex-shrink-0 text-base leading-none">{emoji}</span>
    ) : null
  return (
    <img
      src={`https://flagcdn.com/${code}.svg`}
      alt={code.toUpperCase()}
      title={code.toUpperCase()}
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
  finalScore?: {
    home: number
    away: number
    duration?: string
    pens?: { home: number; away: number }
  }
  liveScore?: { home: number | null; away: number | null; minute: string | null }
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
        <Flag emoji={flag} />
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
  // Live state is data-driven (a fresh in-play score from the poller), not a
  // fixed time window — so a long match never falsely reverts to "Upcoming".
  const live = !resolved ? match.liveScore : undefined
  const isLive = !!live
  const pastKickoff = !resolved && match.closeTimeMs <= now
  const homeScore = resolved ? match.finalScore?.home : undefined
  const awayScore = resolved ? match.finalScore?.away : undefined
  const winnerColor = resolved ? vibrantForOutcome(match.winner) : undefined
  const marketHref = match.marketUrl ?? '#'
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

  // Clicking an outcome jumps straight to the per-answer bet panel (Manifold's
  // standard AnswerCpmmBetPanel) defaulting to YES on the clicked team — no
  // intermediate answer-picker. The dashboard only holds the lightweight
  // SportsMarket, so we fetch the full contract + answers on demand and locate
  // the clicked answer; fall back to the market page if anything goes wrong.
  const [betState, setBetState] = useState<{
    contract: CPMMMultiContract
    answer: Answer
  } | null>(null)
  const [betLoading, setBetLoading] = useState(false)

  const answerIdForOutcome = (o: MatchOutcome) =>
    o === 'teamA'
      ? match.teamAAnswerId
      : o === 'teamB'
      ? match.teamBAnswerId
      : match.drawAnswerId

  async function openBet(outcome: MatchOutcome) {
    if (betLoading) return
    const answerId = answerIdForOutcome(outcome)
    if (!match.contractId || !answerId) {
      router.push(marketHref)
      return
    }
    setBetLoading(true)
    try {
      const c = await getContract(db, match.contractId)
      if (!c || c.mechanism !== 'cpmm-multi-1') {
        router.push(marketHref)
        return
      }
      const answersByContract = await getAnswersForContracts(db, [c.id])
      const answers: Answer[] =
        answersByContract[c.id] ?? (c as any).answers ?? []
      ;(c as any).answers = answers
      const answer = answers.find((a) => a.id === answerId)
      if (!answer) {
        router.push(marketHref)
        return
      }
      setBetState({ contract: c as CPMMMultiContract, answer })
    } catch {
      router.push(marketHref)
    } finally {
      setBetLoading(false)
    }
  }

  return (
    <>
    <div
      className={clsx(
        'bg-canvas-50 border-ink-200 flex flex-col gap-2.5 rounded-xl border p-[18px] transition-colors',
        resolved ? 'opacity-70' : 'hover:border-ink-300'
      )}
    >
      <Row className="justify-between">
        {isLive ? (
          <span className="text-[11px] font-medium" style={{ color: LIVE_COLOR }}>
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
        {isLive && live ? (
          <span
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: LIVE_COLOR }}
          >
            {live.home ?? 0} – {live.away ?? 0}
          </span>
        ) : (
          <span
            className="text-[11px] font-medium"
            style={{ color: winnerColor ?? '#6B7280' }}
          >
            {resolved ? finalLabel : pastKickoff ? 'Awaiting result' : 'Upcoming'}
          </span>
        )}
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
          onClick={() => openBet('teamA')}
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
          onClick={() => openBet('teamB')}
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
            onClick={() => openBet('draw')}
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
      {betState && (
        <Modal
          open
          setOpen={(o) => {
            if (!o) setBetState(null)
          }}
          className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}
        >
          <AnswerCpmmBetPanel
            answer={betState.answer}
            contract={betState.contract}
            outcome="YES"
            closePanel={() => setBetState(null)}
            alwaysShowOutcomeSwitcher
          />
        </Modal>
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
