import clsx from 'clsx'
import dayjs from 'dayjs'
import Link from 'next/link'
import { ReactNode, useState } from 'react'
import { getDisplayProbability } from 'common/calculate'
import {
  BinaryContract,
  Contract,
  contractPath,
  CPMMMultiContract,
  isBinaryMulti,
  isMultiCpmm,
} from 'common/contract'
import { NEWS_FEW_TRADERS } from 'common/news-feed'
import { formatPercentShort, shortFormatNumber } from 'common/util/format'
import { removeEmojis } from 'common/util/string'
import { MultiBetDialog } from 'web/components/bet/bet-dialog'
import { BetButton } from 'web/components/bet/feed-bet-button'
import { Button } from 'web/components/buttons/button'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { Row } from 'web/components/layout/row'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useLiveContract } from 'web/hooks/use-contract'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { trackNews } from './news-events'

/** Where a market sits on the page, for analytics and wording. */
export type MarketPlace = 'featured' | 'outlook' | 'claim' | 'similar'

const isBinary = (c: Contract): c is BinaryContract =>
  c.outcomeType === 'BINARY' && c.mechanism === 'cpmm-1'

/** Too few traders for the price to mean much yet. */
export const isEarlyMarket = (c: Contract) =>
  (c.uniqueBettorCount ?? 0) < NEWS_FEW_TRADERS

const topAnswers = (c: Contract, n: number) =>
  isMultiCpmm(c) && !isBinaryMulti(c)
    ? [...(c as CPMMMultiContract).answers]
        .sort((a, b) => b.prob - a.prob)
        .slice(0, n)
    : []

/** One market on a story: its full question (threshold and deadline
 * included), price, who has traded it, and the buttons to trade it. */
export function NewsMarketRow(props: {
  contract: Contract
  storyId: string
  place: MarketPlace
  /** How many stories link this market, when more than one. */
  storyCount?: number
  /** Attached by a reader rather than the matcher. */
  readerAdded?: boolean
  /** Right-hand control in place of the trade buttons. */
  action?: ReactNode
  /** The report control, shown on the meta line. */
  report?: ReactNode
}) {
  const { storyId, place, storyCount, readerAdded, action, report } = props
  const contract = useLiveContract(props.contract)
  const answers = topAnswers(contract, 3)
  const extra =
    answers.length > 0
      ? (contract as CPMMMultiContract).answers.length - answers.length
      : 0

  return (
    <div className="hover:bg-canvas-50 px-3 py-2.5">
      {/* Phones: question on top, price and buttons underneath. */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <QuestionLink
          contract={contract}
          storyId={storyId}
          place={place}
          className="text-ink-900 min-w-0 flex-1 text-sm leading-snug"
        />
        <Row className="shrink-0 items-center gap-2 self-end sm:self-auto">
          {answers.length === 0 && <Price contract={contract} />}
          {action ?? (
            <TradeButtons contract={contract} storyId={storyId} place={place} />
          )}
        </Row>
      </div>
      {answers.length > 0 && (
        <Row className="mt-1 flex-wrap items-center gap-x-3 gap-y-0.5">
          {answers.map((a) => (
            <span key={a.id} className="text-ink-500 text-xs">
              <span className="text-ink-700">{a.text}</span>{' '}
              <span
                className={clsx(
                  'font-semibold tabular-nums',
                  isEarlyMarket(contract) && 'text-ink-400'
                )}
              >
                {Math.round(a.prob * 100)}%
              </span>
            </span>
          ))}
          {extra > 0 && (
            <span className="text-ink-400 text-xs">+{extra} more</span>
          )}
          {isEarlyMarket(contract) && <EarlyBadge contract={contract} />}
        </Row>
      )}
      <Row className="mt-1 items-center justify-between gap-2">
        <MarketMeta
          contract={contract}
          storyCount={storyCount}
          readerAdded={readerAdded}
        />
        {report}
      </Row>
    </div>
  )
}

export function QuestionLink(props: {
  contract: Contract
  storyId: string
  place: MarketPlace
  className?: string
}) {
  const { contract, storyId, place, className } = props
  return (
    <Link
      href={contractPath(contract)}
      onClick={() =>
        trackNews('news market click', {
          storyId,
          contractId: contract.id,
          place,
          early: isEarlyMarket(contract),
        })
      }
      className={clsx('hover:text-primary-700 hover:underline', className)}
    >
      {removeEmojis(contract.question)}
    </Link>
  )
}

/**
 * The price. An established binary market shows its colour-coded chance; a
 * market with few traders shows its price muted beside a label, so a fresh
 * 50% does not read as a crowd forecast.
 */
export function Price(props: {
  contract: Contract
  size?: 'sm' | 'md' | 'lg'
}) {
  const { contract, size = 'sm' } = props
  const early = isEarlyMarket(contract)
  const text =
    size === 'lg'
      ? 'text-2xl leading-none'
      : size === 'md'
      ? 'text-lg leading-none'
      : 'text-sm'
  const top = topAnswers(contract, 1)[0]
  return (
    <Row className="items-center gap-1.5">
      {top ? (
        <span className="text-ink-700 max-w-[10rem] truncate text-xs">
          {top.text}{' '}
          <span
            className={clsx(
              'font-semibold tabular-nums',
              early ? 'text-ink-400' : 'text-ink-900',
              size !== 'sm' && 'text-base'
            )}
          >
            {Math.round(top.prob * 100)}%
          </span>
        </span>
      ) : early && isBinary(contract) ? (
        <span
          className={clsx(
            'text-ink-400 decoration-ink-300 font-semibold tabular-nums underline decoration-dotted underline-offset-4',
            text
          )}
        >
          {formatPercentShort(getDisplayProbability(contract))}
        </span>
      ) : (
        <ContractStatusLabel
          contract={contract}
          className={clsx('font-semibold', text)}
        />
      )}
      {early && <EarlyBadge contract={contract} />}
    </Row>
  )
}

export function EarlyBadge(props: { contract?: Contract; label?: string }) {
  const n = props.contract?.uniqueBettorCount ?? 0
  const label = props.label ?? (n === 0 ? 'No trades yet' : 'Few traders')
  return (
    <Tooltip
      text={
        n === 0
          ? 'Nobody has traded this market yet. The price is where it opened, not a forecast.'
          : `Only ${n} ${
              n === 1 ? 'trader' : 'traders'
            } so far. Treat the price as an early guess, not a crowd forecast.`
      }
    >
      <span className="whitespace-nowrap rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
        {label}
      </span>
    </Tooltip>
  )
}

export const formatClose = (t: number) =>
  dayjs(t).format(dayjs(t).year() === dayjs().year() ? 'MMM D' : 'MMM D, YYYY')

/** Whether a question names its own deadline. When it doesn't, show the
 * close date beside its price so the percentage can be read. */
export const namesDeadline = (question: string) =>
  /\b(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d|\b(today|tonight|tomorrow|this (week|month|year|season)|end of (the )?(year|month|week|season)|eoy)\b/i.test(
    question
  )

/** Who has traded it, how much, when it closes, and where else it is used. */
export function MarketMeta(props: {
  contract: Contract
  storyCount?: number
  readerAdded?: boolean
  className?: string
}) {
  const { contract, storyCount, readerAdded, className } = props
  const traders = contract.uniqueBettorCount ?? 0
  const parts = [
    `${shortFormatNumber(traders)} ${traders === 1 ? 'trader' : 'traders'}`,
    contract.volume > 0 ? `Ṁ${shortFormatNumber(contract.volume)} traded` : '',
    contract.closeTime ? `closes ${formatClose(contract.closeTime)}` : '',
  ].filter(Boolean)
  return (
    <Row
      className={clsx(
        'text-ink-500 min-w-0 flex-wrap items-center gap-x-1.5 text-[11px]',
        className
      )}
    >
      <span>{parts.join(' · ')}</span>
      {storyCount && storyCount > 1 ? (
        <Tooltip text="The same market is linked from every story about this event.">
          <span className="text-ink-500">· on {storyCount} stories</span>
        </Tooltip>
      ) : null}
      {readerAdded && <span>· linked by a reader</span>}
    </Row>
  )
}

/** Yes and No for a binary market, Bet for the others. Both count as a trade
 * intent; a placed binary trade counts as a trade. */
export function TradeButtons(props: {
  contract: Contract
  storyId: string
  place: MarketPlace
}) {
  const { contract, storyId, place } = props
  const user = useUser()
  const [betOpen, setBetOpen] = useState(false)
  const closed =
    !!contract.resolution ||
    (!!contract.closeTime && contract.closeTime < Date.now())
  if (closed) return null
  const meta = { storyId, contractId: contract.id, place }

  if (isBinary(contract)) {
    return (
      <div onClickCapture={() => trackNews('news trade intent', meta)}>
        <BetButton
          contract={contract}
          user={user}
          questionTitle={contract.question}
          location="news feed"
          onBuySuccess={() => trackNews('news trade', meta)}
          className="flex"
        />
      </div>
    )
  }
  if (!isMultiCpmm(contract)) return null
  return (
    <>
      <Button
        size="2xs"
        color="indigo-outline"
        onClick={() => {
          trackNews('news trade intent', meta)
          if (!user) {
            firebaseLogin()
            return
          }
          setBetOpen(true)
        }}
      >
        Bet
      </Button>
      {betOpen && (
        <MultiBetDialog
          contract={contract as CPMMMultiContract}
          open={betOpen}
          setOpen={setBetOpen}
        />
      )}
    </>
  )
}
