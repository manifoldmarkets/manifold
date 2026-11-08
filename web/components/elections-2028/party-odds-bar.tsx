import clsx from 'clsx'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import { Answer } from 'common/answer'
import { getAnswerProbability } from 'common/calculate'
import { Contract, contractPath, isMultiCpmm } from 'common/contract'
import { useLiveContract } from 'web/hooks/use-contract'
import { formatOdds } from 'web/components/usa-map/election-display'
import {
  DEM_COLOR,
  DEM_DARK_HEX,
  getPartyProbs,
  isDemocraticAnswer,
  isRepublicanAnswer,
  REP_COLOR,
  REP_DARK_HEX,
} from 'web/components/usa-map/state-election-map'
import { track } from 'web/lib/service/analytics'
import { AnswerBetModal } from './answer-bet-modal'

const DEM_LOGO = '/politics-party/democrat_symbol.png'
const REP_LOGO = '/politics-party/republican_symbol.png'

// The presidency by party: one line with each party's chance at its end of
// a split bar, and a bet button beside each. Numbers are ink; the party logos
// and bar segments carry the colour. `sm` drops the bet buttons (a secondary
// market with its own link), but its numbers still bet on their party.
export function PartyOddsBar(props: {
  contract: Contract
  label: string
  trackingName: string
  size?: 'lg' | 'sm'
}) {
  const { label, trackingName, size = 'lg' } = props
  const contract = useLiveContract(props.contract)
  const [betAnswer, setBetAnswer] = useState<Answer | undefined>()
  const probs = getPartyProbs(contract)
  if (!probs || !isMultiCpmm(contract)) return null
  const { dem, rep, other } = probs
  const demAnswer = contract.answers.find((a) => isDemocraticAnswer(a.text))
  const repAnswer = contract.answers.find((a) => isRepublicanAnswer(a.text))
  const otherAnswer = contract.answers.find(
    (a) => !isDemocraticAnswer(a.text) && !isRepublicanAnswer(a.text)
  )
  const total = dem + rep + other || 1
  const bet = (answer: Answer | undefined, party: string) => {
    if (!answer) return
    track('bet intent', { location: trackingName, party })
    setBetAnswer(answer)
  }
  const big = size === 'lg'

  const bar = (
    <div
      className={clsx(
        'flex min-w-0 flex-1 gap-0.5',
        big ? 'h-4 sm:h-5' : 'h-3'
      )}
      role="img"
      aria-label={`Democrats ${formatOdds(dem)}, Republicans ${formatOdds(
        rep
      )}${other > 0.005 ? `, another party ${formatOdds(other)}` : ''}`}
    >
      <div
        className="h-full rounded-l-md"
        style={{ width: `${(dem / total) * 100}%`, backgroundColor: DEM_COLOR }}
      />
      {other > 0.005 && (
        <div
          className="bg-ink-300 h-full"
          style={{ width: `${(other / total) * 100}%` }}
        />
      )}
      <div
        className="h-full rounded-r-md"
        style={{ width: `${(rep / total) * 100}%`, backgroundColor: REP_COLOR }}
      />
    </div>
  )

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-600 text-xs font-semibold uppercase tracking-wide">
          {label}
        </span>
        <span className="flex shrink-0 items-baseline gap-3 whitespace-nowrap">
          {big && otherAnswer && (
            <button
              type="button"
              onClick={() => bet(otherAnswer, 'O')}
              className="text-ink-500 hover:text-ink-800 text-xs hover:underline"
            >
              Other {formatOdds(getAnswerProbability(contract, otherAnswer.id))}
            </button>
          )}
          <Link
            href={contractPath(contract)}
            className="text-ink-500 hover:text-primary-700 text-xs hover:underline"
          >
            Market →
          </Link>
        </span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <PartyFigure
          logo={DEM_LOGO}
          name="Democrats"
          prob={dem}
          big={big}
          onBet={demAnswer ? () => bet(demAnswer, 'D') : undefined}
        />
        {big && (
          <PartyBetButton
            label="Bet"
            fullLabel="Bet Democrats"
            color={DEM_DARK_HEX}
            disabled={!demAnswer}
            onClick={() => bet(demAnswer, 'D')}
            className="hidden sm:block"
          />
        )}
        {bar}
        {big && (
          <PartyBetButton
            label="Bet"
            fullLabel="Bet Republicans"
            color={REP_DARK_HEX}
            disabled={!repAnswer}
            onClick={() => bet(repAnswer, 'R')}
            className="hidden sm:block"
          />
        )}
        <PartyFigure
          logo={REP_LOGO}
          name="Republicans"
          prob={rep}
          big={big}
          right
          onBet={repAnswer ? () => bet(repAnswer, 'R') : undefined}
        />
      </div>
      {big && (
        <div className="grid grid-cols-2 gap-2 sm:hidden">
          <PartyBetButton
            label="Bet Democrats"
            color={DEM_DARK_HEX}
            disabled={!demAnswer}
            onClick={() => bet(demAnswer, 'D')}
          />
          <PartyBetButton
            label="Bet Republicans"
            color={REP_DARK_HEX}
            disabled={!repAnswer}
            onClick={() => bet(repAnswer, 'R')}
          />
        </div>
      )}
      <AnswerBetModal
        contract={contract}
        answer={betAnswer}
        onClose={() => setBetAnswer(undefined)}
      />
    </div>
  )
}

// A party's logo and chance; a button that bets on the party where the
// market has its answer.
function PartyFigure(props: {
  logo: string
  name: string
  prob: number
  big: boolean
  right?: boolean
  onBet?: () => void
}) {
  const { logo, name, prob, big, right, onBet } = props
  const Tag = onBet ? 'button' : 'div'
  return (
    <Tag
      {...(onBet
        ? {
            type: 'button' as const,
            onClick: onBet,
            'aria-haspopup': 'dialog' as const,
            'aria-label': `Bet on ${name}: ${formatOdds(prob)}`,
          }
        : {})}
      className={clsx(
        'flex shrink-0 items-center gap-1.5 rounded-md',
        right && 'flex-row-reverse text-right',
        onBet && 'hover:bg-canvas-50 -m-1 p-1'
      )}
    >
      <Image
        src={logo}
        alt=""
        width={big ? 28 : 20}
        height={big ? 28 : 20}
        className={clsx('object-contain', big ? 'h-7 w-7' : 'h-5 w-5')}
      />
      <div className="flex flex-col leading-none">
        <span
          className={clsx(
            'text-ink-1000 font-semibold tabular-nums',
            big ? 'text-2xl sm:text-3xl' : 'text-lg'
          )}
        >
          {formatOdds(prob)}
        </span>
        <span className="text-ink-600 mt-0.5 hidden text-xs sm:block">
          {name}
        </span>
      </div>
    </Tag>
  )
}

function PartyBetButton(props: {
  label: string
  fullLabel?: string
  color: string
  disabled: boolean
  onClick: () => void
  className?: string
}) {
  const { label, fullLabel, color, disabled, onClick, className } = props
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={fullLabel}
      className={clsx(
        'shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-[filter] hover:brightness-110 disabled:opacity-40',
        className
      )}
      style={{ backgroundColor: color }}
    >
      {label}
    </button>
  )
}
