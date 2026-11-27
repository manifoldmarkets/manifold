import { ChevronRightIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { useState } from 'react'

import { formatJustTime } from 'client-common/lib/time'
import { EsportsMarketOverlay } from 'common/api/schema'
import { contractPath } from 'common/contract'
import { EsportsSeriesFacts } from 'common/esports/types'
import { shortFormatNumber } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { PriceChip } from 'web/components/sports/game-row'
import { SportsVersusBetDialog } from 'web/components/sports/sports-bet-panel'
import { canBetOnSeries } from 'web/hooks/use-esports-tournaments'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { TeamPlate } from './esports-marks'
import { seriesNote } from './series-note'

export type SeriesRecord = { wins: number; losses: number }
type Side = 0 | 1

/**
 * One series, two sides: the teams, the score once there is one, and each
 * side's price as its bet button when the market's answers are the two teams.
 * A market that doesn't line up gets a plain link instead.
 */
export function SeriesRow(props: {
  series: EsportsSeriesFacts
  market: EsportsMarketOverlay | undefined
  /** Each team's record going in, for a Swiss pairing. */
  records?: [SeriesRecord, SeriesRecord]
  className?: string
}) {
  const { series, market, records, className } = props
  const user = useUser()
  const [betOn, setBetOn] = useState<Side>()
  const teams = [series.team1, series.team2] as const
  const scores = [series.score?.team1, series.score?.team2] as const
  const answers = teams.map(
    (t) => (t && market?.answers.find((a) => a.teamId === t.id)) || undefined
  )
  const canBet = series.status !== 'final' && canBetOnSeries(market)
  const live = series.status === 'in_progress'
  const won = (s: Side) =>
    series.winnerId != null && teams[s]?.id === series.winnerId
  const lost = (s: Side) => series.winnerId != null && !won(s)

  const price = (s: Side, className?: string) => {
    const answer = answers[s]
    if (!canBet || !answer) return null
    return (
      <PriceChip
        prob={answer.prob}
        label={`Bet on ${teams[s]?.name}`}
        className={className}
        onClick={() => {
          if (!user) return firebaseLogin()
          track('bet intent', { location: 'esports series' })
          setBetOn(s)
        }}
      />
    )
  }
  const score = (s: Side) =>
    series.status !== 'scheduled' &&
    scores[s] != null && (
      <span
        className={clsx(
          'shrink-0 text-base font-bold tabular-nums',
          live ? 'text-scarlet-600' : won(s) ? 'text-ink-1000' : 'text-ink-500'
        )}
      >
        {scores[s]}
      </span>
    )
  const name = (s: Side, right?: boolean) => (
    <Col className={clsx('min-w-0 flex-1', right && 'items-end text-right')}>
      <span
        className={clsx(
          'max-w-full truncate text-sm',
          won(s) ? 'text-ink-1000 font-bold' : 'text-ink-900 font-semibold',
          lost(s) && '!text-ink-500'
        )}
      >
        {teams[s]?.name ?? 'To be decided'}
        {won(s) && <span aria-label="winner"> ✓</span>}
      </span>
      {records && (
        <span className="text-ink-500 text-[11px] tabular-nums">
          {records[s].wins}–{records[s].losses}
        </span>
      )}
    </Col>
  )
  // Team 1's share of the two prices: the bar the sides pull on.
  const total = (answers[0]?.prob ?? 0) + (answers[1]?.prob ?? 0)
  const share = total > 0 ? ((answers[0]?.prob ?? 0) / total) * 100 : 50

  return (
    <div
      id={`series-${series.id}`}
      className={clsx(
        '@container/series min-w-0 scroll-mt-32 px-3 py-3 sm:px-4',
        className
      )}
    >
      <Row className="mb-2 items-center gap-2">
        <span className="text-ink-500 min-w-0 flex-1 truncate text-[11px] font-semibold">
          <SeriesWhen series={series} />
          {series.bestOf ? ` · Bo${series.bestOf}` : ''}
          {series.round ? ` · ${series.round}` : ''}
        </span>
        {market && (
          <Link
            href={contractPath(market)}
            className="text-ink-500 hover:text-primary-700 flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums"
          >
            {market.answers.every((a) => a.teamId != null) ? (
              <>
                Ṁ{shortFormatNumber(market.volume)}
                <span className="sr-only"> traded, view market</span>
              </>
            ) : (
              'View market'
            )}
            <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </Row>
      {/* Phones: a team per line, its price at the end, like a game card. */}
      <Col className="@[30rem]/series:hidden gap-2">
        {([0, 1] as const).map((s) => (
          <Row key={s} className="min-w-0 items-center gap-2.5">
            <TeamPlate team={teams[s]} muted={lost(s)} />
            {name(s)}
            {score(s)}
            {price(s)}
          </Row>
        ))}
      </Col>
      {/* Wider: face to face, the prices between them on one bar. */}
      <div className="@[30rem]/series:grid hidden grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <Row className="min-w-0 items-center gap-2.5">
          <TeamPlate team={teams[0]} size="lg" muted={lost(0)} />
          {name(0)}
          {score(0)}
        </Row>
        <Col className="items-center gap-1.5">
          <Row className="items-center gap-1.5">
            {price(0)}
            <span className="text-ink-400 text-[10px] font-black uppercase">
              vs
            </span>
            {price(1)}
          </Row>
          {canBet && (
            <div
              aria-hidden
              className="bg-ink-200 h-1 w-full overflow-hidden rounded-full"
            >
              <div
                className="bg-primary-500 h-full"
                style={{ width: `${share}%` }}
              />
            </div>
          )}
        </Col>
        <Row className="min-w-0 flex-row-reverse items-center gap-2.5">
          <TeamPlate team={teams[1]} size="lg" muted={lost(1)} />
          {name(1, true)}
          {score(1)}
        </Row>
      </div>
      {betOn != null && market && (
        <SportsVersusBetDialog
          contractId={market.contractId}
          initialAnswerId={answers[betOn]?.id}
          onClose={() => setBetOn(undefined)}
        />
      )}
    </div>
  )
}

/**
 * Live, final, or the start in the visitor's own time zone, then what is
 * missing or held back, if anything: "Teams TBD", or why a result isn't
 * counted yet.
 */
export function SeriesWhen(props: { series: EsportsSeriesFacts }) {
  const { status, startTimeMs } = props.series
  const note = seriesNote(props.series)
  const held = note && <span> · {note}</span>
  if (status === 'in_progress')
    return (
      <span className="text-scarlet-600">
        <span className="bg-scarlet-500 mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full align-middle" />
        Live{held}
      </span>
    )
  if (status === 'final')
    return <span className="text-ink-700">Final{held}</span>
  return (
    <span className="text-ink-900 tabular-nums">
      {startTimeMs != null
        ? formatJustTime(startTimeMs).replace(':00', '')
        : 'Time to be announced'}
      {held}
    </span>
  )
}
