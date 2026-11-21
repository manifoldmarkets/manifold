import { ArrowRightIcon, CheckIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { useState } from 'react'
import { getAnswerProbability } from 'common/calculate'
import { contractPath, CPMMMultiContract, isMultiCpmm } from 'common/contract'
import {
  EsportsSeries,
  EsportsTitle,
  sideProb,
  SwissPairing,
} from 'common/esports'
import { formatPercent, shortFormatNumber } from 'common/util/format'
import { BuyPanel } from 'web/components/bet/bet-panel'
import { Col } from 'web/components/layout/col'
import {
  Modal,
  MODAL_CLASS,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { PriceChip } from 'web/components/sports/game-row'
import { useUser } from 'web/hooks/use-user'
import { EsportsMarket } from 'web/hooks/use-esports'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { TeamPlate, TitleMark } from './esports-marks'

const STAKES: Record<SwissPairing['stakes'], string | undefined> = {
  decider: 'Decider',
  qualification: 'For a spot',
  elimination: 'Elimination',
  regular: undefined,
}

/** What rides on a Swiss series, in a line. */
export function stakesLine(pairing: SwissPairing, advanceTo: string) {
  switch (pairing.stakes) {
    case 'decider':
      return `Winner goes through to ${advanceTo}, loser goes home`
    case 'qualification':
      return `Winner goes through to ${advanceTo}`
    case 'elimination':
      return 'Loser goes home'
    default:
      return undefined
  }
}

const record = (r: { wins: number; losses: number }) => `${r.wins}–${r.losses}`

/**
 * One series, two sides: like a game card, with each team's chance as its
 * bet button. A series is one answer, "A defeats B": backing A buys YES on
 * it and backing B buys NO, and the ticket says so.
 */
export function SeriesCard(props: {
  series: EsportsSeries
  market: EsportsMarket | undefined
  title: EsportsTitle
  /** "Worlds 2026 · Swiss R5". */
  context: string
  pairing?: SwissPairing
  advanceTo?: string
  /**
   * A card on its own, or a row in a panel of one round's series, which says
   * the round and the stakes once above them.
   */
  variant?: 'card' | 'row'
  className?: string
}) {
  const {
    series,
    market,
    title,
    context,
    pairing,
    advanceTo,
    variant = 'card',
    className,
  } = props
  const isRow = variant === 'row'
  const user = useUser()
  const [side, setSide] = useState<'a' | 'b'>()
  const open = series.status === 'open'
  const stakes = pairing ? STAKES[pairing.stakes] : undefined
  const line = pairing && advanceTo ? stakesLine(pairing, advanceTo) : undefined

  const onBet = (s: 'a' | 'b') => {
    if (!user) {
      firebaseLogin()
      return
    }
    track('bet intent', { location: 'esports series', side: s })
    setSide(s)
  }

  const price = (s: 'a' | 'b', className?: string) => {
    const won = series.winner === s
    return open ? (
      <PriceChip
        prob={sideProb(series, s)}
        onClick={(e) => {
          e.stopPropagation()
          onBet(s)
        }}
        label={`Back ${series[s].name}`}
        className={className}
      />
    ) : (
      <span
        className={clsx(
          'w-16 text-xs font-semibold sm:w-20',
          won ? 'text-ink-1000' : 'text-ink-400',
          className
        )}
      >
        {series.status === 'final' ? (won ? 'Won' : 'Lost') : '—'}
      </span>
    )
  }
  const teamText = (s: 'a' | 'b', align: 'left' | 'right') => {
    const team = series[s]
    const won = series.winner === s
    const lost = !!series.winner && !won
    const rec = pairing ? (s === 'a' ? pairing.recordA : pairing.recordB) : null
    return (
      <Col
        className={clsx(
          'min-w-0 flex-1',
          align === 'right' && 'items-end text-right'
        )}
      >
        <span
          className={clsx(
            'max-w-full truncate text-sm',
            won ? 'text-ink-1000 font-bold' : 'text-ink-900 font-semibold',
            lost && 'text-ink-500'
          )}
        >
          {team.name}
          {won && (
            <CheckIcon
              className="text-ink-700 ml-1 inline h-4 w-4 align-[-3px]"
              aria-label="winner"
            />
          )}
        </span>
        {rec && (
          <span className="text-ink-500 text-[11px] tabular-nums">
            {record(rec)}
          </span>
        )}
      </Col>
    )
  }
  const lost = (s: 'a' | 'b') => !!series.winner && series.winner !== s
  const volumeLink = market && 'slug' in market && (
    <Link
      href={contractPath(market)}
      className="text-ink-500 hover:text-primary-700 flex shrink-0 items-center gap-1 text-[11px] tabular-nums"
      title={`“${series.text}” in ${market.question}`}
    >
      Ṁ{shortFormatNumber(series.volume)}
      <span className="sr-only"> traded on this series</span>
      <ArrowRightIcon className="h-3 w-3" aria-hidden />
    </Link>
  )

  // Phones: a team per line, its price at the end, like a game card.
  const stacked = (
    <Col className="@[30rem]/series:hidden gap-2 pb-3 pl-4 pr-3">
      {(['a', 'b'] as const).map((s) => (
        <Row key={s} className="min-w-0 items-center gap-2.5">
          <TeamPlate team={series[s]} muted={lost(s)} />
          {teamText(s, 'left')}
          {price(s, 'text-right')}
        </Row>
      ))}
      {isRow && <div className="flex justify-end">{volumeLink}</div>}
    </Col>
  )
  // Wider: face to face, the prices between them on one bar.
  const a = Math.round(series.prob * 100)
  const versus = (
    <div className="@[30rem]/series:grid hidden grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 pb-3 pl-4 pr-3">
      <Row className="min-w-0 items-center gap-2.5">
        <TeamPlate team={series.a} size="lg" muted={lost('a')} />
        {teamText('a', 'left')}
      </Row>
      <Col className="items-center gap-1.5">
        <Row className="items-center gap-1.5">
          {price('a', 'text-center')}
          <span className="text-ink-400 text-[10px] font-black uppercase">
            vs
          </span>
          {price('b', 'text-center')}
        </Row>
        {open && (
          <div
            aria-hidden
            className="bg-ink-200 flex h-1 w-full overflow-hidden rounded-full"
          >
            <div
              className="h-full"
              style={{ width: `${a}%`, backgroundColor: title.color }}
            />
          </div>
        )}
        {isRow && volumeLink}
      </Col>
      <Row className="min-w-0 flex-row-reverse items-center gap-2.5">
        <TeamPlate team={series.b} size="lg" muted={lost('b')} />
        {teamText('b', 'right')}
      </Row>
    </div>
  )

  return (
    <div
      id={`series-${series.answerId}`}
      className={clsx(
        '@container/series relative min-w-0 scroll-mt-32',
        isRow
          ? 'pt-3'
          : 'bg-canvas-0 border-ink-200 hover:border-ink-300 overflow-hidden rounded-xl border transition-colors',
        className
      )}
    >
      {/* The game's colour, as a thin edge: which world this card is from. */}
      {!isRow && (
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundColor: title.color }}
        />
      )}
      {!isRow && (
        <Row className="min-h-[2.5rem] items-center gap-2 py-2 pl-4 pr-3">
          <TitleMark title={title} />
          <span className="text-ink-500 min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-wider">
            {context}
            {series.bestOf ? ` · Bo${series.bestOf}` : ''}
          </span>
          {stakes && open && (
            <span className="bg-amber-500/15 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-400">
              {stakes}
            </span>
          )}
          {series.status === 'awaiting' && (
            <span className="text-ink-500 shrink-0 text-[10px] font-semibold uppercase tracking-wide">
              Awaiting result
            </span>
          )}
        </Row>
      )}
      {stacked}
      {versus}
      {!isRow && (
        <Row className="border-ink-100 items-center gap-2 border-t py-2 pl-4 pr-3">
          <span className="text-ink-600 min-w-0 flex-1 truncate text-[11px]">
            {line ??
              (series.winner
                ? `${series[series.winner].name} won`
                : series.label ?? series.text)}
          </span>
          {volumeLink}
        </Row>
      )}
      {side && market && isMultiCpmm(market) && (
        <SeriesBetDialog
          contract={market as CPMMMultiContract}
          series={series}
          side={side}
          context={context}
          onClose={() => setSide(undefined)}
        />
      )}
    </div>
  )
}

/**
 * The ticket for one side of a series. The market prices "A defeats B", so
 * backing B is a NO on it: the header names the side, its own chance, and the
 * answer the bet goes on.
 */
export function SeriesBetDialog(props: {
  contract: CPMMMultiContract
  series: EsportsSeries
  side: 'a' | 'b'
  context: string
  onClose: () => void
}) {
  const { contract, series, side, context, onClose } = props
  const answer = contract.answers.find((a) => a.id === series.answerId)
  if (!answer) return null
  return (
    <Modal
      open
      setOpen={(open) => {
        if (!open) onClose()
      }}
      className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}
    >
      <Col className="bg-canvas-0 w-full rounded-2xl">
        <BuyPanel
          contract={contract}
          multiProps={{ answers: contract.answers, answerToBuy: answer }}
          initialOutcome={side === 'a' ? 'YES' : 'NO'}
          onBuySuccess={() => setTimeout(onClose, 500)}
          location="esports series"
          inModal
          alwaysShowOutcomeSwitcher
          pseudonym={{
            YES: { pseudonymName: series.a.code, pseudonymColor: 'azure' },
            NO: { pseudonymName: series.b.code, pseudonymColor: 'sienna' },
            opposed: true,
          }}
        >
          {(outcome) => {
            const s = outcome === 'NO' ? 'b' : 'a'
            const team = series[s]
            const p = getAnswerProbability(contract, answer.id)
            return (
              <Col className="text-ink-900 mb-4 gap-2">
                <span className="text-ink-500 text-[10px] font-bold uppercase tracking-wider">
                  {context}
                  {series.bestOf ? ` · Bo${series.bestOf}` : ''}
                </span>
                <Row className="items-center gap-2">
                  <TeamPlate team={series.a} size="sm" />
                  <span className="text-ink-400 text-xs">vs</span>
                  <TeamPlate team={series.b} size="sm" />
                  <span className="text-ink-700 min-w-0 truncate text-sm">
                    {series.a.name} vs {series.b.name}
                  </span>
                </Row>
                <Row className="items-baseline justify-between gap-2">
                  <span className="text-ink-600 text-sm">
                    {team.name} to win
                  </span>
                  <span className="text-lg font-semibold tabular-nums">
                    {formatPercent(s === 'a' ? p : 1 - p)}
                  </span>
                </Row>
                <p className="text-ink-500 text-xs">
                  Backing {team.code} buys {outcome} on “{answer.text}” in{' '}
                  <Link
                    href={contractPath(contract)}
                    className="text-primary-700 hover:underline"
                  >
                    {contract.question}
                  </Link>
                  . Check the market's rules for how it resolves.
                </p>
              </Col>
            )
          }}
        </BuyPanel>
      </Col>
    </Modal>
  )
}
