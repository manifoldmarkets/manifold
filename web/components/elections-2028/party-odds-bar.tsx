import clsx from 'clsx'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import { Answer } from 'common/answer'
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

// The presidency by party, as a tall split bar: the headline number for 2028.
// Numbers are ink; the party logos and bar segments carry the colour.
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-600 text-xs font-semibold uppercase tracking-wide">
          {label}
        </span>
        <Link
          href={contractPath(contract)}
          className="text-ink-500 hover:text-primary-700 text-xs hover:underline"
        >
          Market →
        </Link>
      </div>
      <div className="flex items-end justify-between gap-3">
        <PartyFigure
          logo={DEM_LOGO}
          name="Democrats"
          prob={dem}
          big={big}
          align="left"
        />
        <PartyFigure
          logo={REP_LOGO}
          name="Republicans"
          prob={rep}
          big={big}
          align="right"
        />
      </div>
      <div
        className={clsx('flex w-full gap-0.5', big ? 'h-7' : 'h-3')}
        role="img"
        aria-label={`Democrats ${formatOdds(dem)}, Republicans ${formatOdds(
          rep
        )}${other > 0.005 ? `, another party ${formatOdds(other)}` : ''}`}
      >
        <div
          className="h-full rounded-l-md"
          style={{
            width: `${(dem / total) * 100}%`,
            backgroundColor: DEM_COLOR,
          }}
        />
        {other > 0.005 && (
          <div
            className="bg-ink-300 h-full"
            style={{ width: `${(other / total) * 100}%` }}
          />
        )}
        <div
          className="h-full rounded-r-md"
          style={{
            width: `${(rep / total) * 100}%`,
            backgroundColor: REP_COLOR,
          }}
        />
      </div>
      {big && (
        <div className="mt-1 grid grid-cols-[1fr_auto_1fr] gap-2">
          <PartyBetButton
            label="Bet Democrats"
            color={DEM_DARK_HEX}
            disabled={!demAnswer}
            onClick={() => bet(demAnswer, 'D')}
          />
          {otherAnswer ? (
            <button
              type="button"
              onClick={() => bet(otherAnswer, 'O')}
              className="border-ink-300 text-ink-700 hover:bg-canvas-50 rounded-md border px-3 text-xs font-semibold"
            >
              Other {formatOdds(other)}
            </button>
          ) : (
            <span />
          )}
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

function PartyFigure(props: {
  logo: string
  name: string
  prob: number
  big: boolean
  align: 'left' | 'right'
}) {
  const { logo, name, prob, big, align } = props
  return (
    <div
      className={clsx(
        'flex items-center gap-2',
        align === 'right' && 'flex-row-reverse text-right'
      )}
    >
      <Image
        src={logo}
        alt=""
        width={big ? 36 : 22}
        height={big ? 36 : 22}
        className={clsx('object-contain', big ? 'h-9 w-9' : 'h-5 w-5')}
      />
      <div className="flex flex-col leading-none">
        <span
          className={clsx(
            'text-ink-1000 font-semibold',
            big ? 'text-4xl sm:text-5xl' : 'text-xl'
          )}
        >
          {formatOdds(prob)}
        </span>
        <span className="text-ink-600 mt-1 text-xs sm:text-sm">{name}</span>
      </div>
    </div>
  )
}

function PartyBetButton(props: {
  label: string
  color: string
  disabled: boolean
  onClick: () => void
}) {
  const { label, color, disabled, onClick } = props
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm transition-[filter] hover:brightness-110 disabled:opacity-40"
      style={{ backgroundColor: color }}
    >
      {label}
    </button>
  )
}
