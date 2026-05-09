import { useState } from 'react'
import clsx from 'clsx'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'

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
}

function MockBetPanel({
  match,
  initialOutcome,
  onClose,
}: {
  match: SportsMatch
  initialOutcome: MatchOutcome
  onClose: () => void
}) {
  const [selected, setSelected] = useState<MatchOutcome>(
    initialOutcome === 'draw' && match.hasDraw === false ? 'teamA' : initialOutcome
  )
  const [amount, setAmount] = useState(10)

  const outcomes: { key: MatchOutcome; label: string; prob: number; color: string }[] = [
    { key: 'teamA', label: `${match.teamA.flag} ${match.teamA.name}`.trim(), prob: match.teamA.prob, color: SPORTS_COLORS.teamA },
    ...(match.hasDraw !== false ? [{ key: 'draw' as MatchOutcome, label: 'Draw', prob: match.draw.prob, color: SPORTS_COLORS.draw }] : []),
    { key: 'teamB', label: `${match.teamB.flag} ${match.teamB.name}`.trim(), prob: match.teamB.prob, color: SPORTS_COLORS.teamB },
  ]

  const current = outcomes.find((o) => o.key === selected)!
  const payout = Math.round(amount * (100 / Math.max(current.prob, 1)))

  return (
    <Modal open setOpen={(open) => { if (!open) onClose() }} size="sm">
      <Col className={clsx(MODAL_CLASS, 'w-full gap-5')}>

        {/* Match label */}
        <p className="text-ink-1000 text-center text-base font-semibold">
          {match.teamA.name} vs {match.teamB.name}
        </p>

        {/* Outcome toggle */}
        <Row className="bg-canvas-100 items-stretch rounded-lg">
          {outcomes.map((o) => (
            <Row key={o.key} className="flex-1 items-stretch">
              <button
                onClick={() => setSelected(o.key)}
                className={clsx(
                  'flex-1 rounded-lg px-2 py-2.5 text-xs font-medium transition-colors',
                  selected === o.key ? 'text-white' : 'text-ink-500 hover:text-ink-700'
                )}
                style={selected === o.key ? { backgroundColor: o.color } : undefined}
              >
                {o.label}
              </button>
            </Row>
          ))}
        </Row>

        {/* Amount */}
        <Col className="gap-2">
          <label className="text-ink-700 text-xs font-medium">Bet amount</label>
          <Row className="border-ink-300 bg-canvas-50 focus-within:border-primary-500 w-40 items-center rounded-md border px-3 py-2 transition-colors">
            <span className="text-ink-500 mr-1 font-mana text-sm">Ṁ</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 0))}
              className="text-ink-1000 w-full bg-transparent text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              min="1"
            />
          </Row>
        </Col>

        {/* Stats */}
        <Col className="bg-canvas-50 gap-1.5 rounded-md p-3">
          <Row className="justify-between gap-4">
            <span className="text-ink-500 text-xs">To win</span>
            <span className="text-ink-1000 text-xs font-medium">
              Ṁ{payout.toLocaleString()}
            </span>
          </Row>
          <Row className="justify-between gap-4">
            <span className="text-ink-500 text-xs">New probability</span>
            <span className="text-ink-1000 text-xs font-medium">
              ~{Math.min(current.prob + 1, 99)}%
            </span>
          </Row>
        </Col>

        {/* CTA + Cancel */}
        <Row className="gap-2">
          <button
            onClick={onClose}
            className="border-ink-300 text-ink-600 hover:bg-canvas-50 shrink-0 rounded-md border px-3 py-3 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="text-ink-1000 hover:bg-ink-100/10 min-w-0 flex-1 rounded-md border-2 px-3 py-3 text-sm font-semibold transition-colors"
            style={{ borderColor: current.color }}
          >
            Buy {current.label} to win Ṁ{payout.toLocaleString()}
          </button>
        </Row>

        <p className="text-ink-400 text-center text-xs">
          Prototype — betting not yet connected
        </p>
      </Col>
    </Modal>
  )
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
        <div className="flex flex-col items-end gap-1">
          <div className="bg-ink-200 h-0.5 w-14 rounded-full">
            <div className={clsx('h-0.5 rounded-full', barColor)} style={{ width: `${prob}%` }} />
          </div>
          <span
            className="text-xs font-medium"
            style={isWinner && winnerColor ? { color: winnerColor } : undefined}
          >
            {prob}%
          </span>
        </div>
      )}
    </div>
  )
}

export function SportsMatchCard({ match }: { match: SportsMatch }) {
  const [betOutcome, setBetOutcome] = useState<MatchOutcome | null>(null)
  const resolved = match.status === 'resolved'
  const homeScore = resolved ? match.finalScore?.home : undefined
  const awayScore = resolved ? match.finalScore?.away : undefined
  const winnerColor = resolved ? vibrantForOutcome(match.winner) : undefined

  return (
    <>
      <div
        className={clsx(
          'bg-canvas-50 border-ink-200 flex flex-col gap-2.5 rounded-xl border p-[18px] transition-colors',
          resolved ? 'opacity-70' : 'hover:border-ink-300'
        )}
      >
        <Row className="justify-between">
          <span className="text-ink-500 text-[11px]">
            {resolved ? match.closeDateLabel : `Closes ${match.closeTime}`}
          </span>
          <span
            className="text-[11px]"
            style={{ color: winnerColor ?? '#6B7280' }}
          >
            {resolved ? 'Final' : 'Upcoming'}
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
            onClick={() => setBetOutcome('teamA')}
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
            onClick={() => setBetOutcome('teamB')}
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
              onClick={() => setBetOutcome('draw')}
            />
          )}
        </Col>

        <Row className="border-ink-200 justify-between border-t pt-2">
          <span className="text-ink-500 text-[11px]">Ṁ {match.volume} vol</span>
          {resolved ? (
            <span className="text-[11px]" style={{ color: winnerColor }}>
              ✓{' '}
              {match.winner === 'teamA'
                ? match.teamA.name
                : match.winner === 'teamB'
                ? match.teamB.name
                : 'Draw'}
            </span>
          ) : (
            <a
              href={match.marketUrl ?? '#'}
              className="text-ink-500 hover:text-yes-500 text-[11px] transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              View market →
            </a>
          )}
        </Row>
      </div>

      {betOutcome && (
        <MockBetPanel
          match={match}
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
    <div className="bg-canvas-0 border-ink-200 flex items-center justify-between rounded-lg border px-3.5 py-2.5 opacity-60">
      <Col className="gap-0.5">
        <span className="text-ink-900 text-sm">
          {match.teamA.name} vs {match.teamB.name}
        </span>
        <span className="text-ink-500 text-[11px]">
          {match.closeDateLabel} · ✓ {winnerName}
        </span>
      </Col>
      <span className="text-ink-500 text-[11px]">Resolved</span>
    </div>
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
