import clsx from 'clsx'
import Link from 'next/link'
import { sortBy } from 'lodash'
import { useCallback, useEffect, useState } from 'react'

import { getAnswerProbability, getDisplayProbability } from 'common/calculate'
import {
  BinaryContract,
  Contract,
  contractPath,
  CPMMMultiContract,
  isMultiCpmm,
} from 'common/contract'
import { AnswerCpmmBetPanel } from 'web/components/answers/answer-bet-panel'
import { BuyPanel } from 'web/components/bet/bet-panel'
import {
  Modal,
  MODAL_CLASS,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import { formatOdds } from 'web/components/usa-map/election-display'
import {
  isDemocraticAnswer,
  isRepublicanAnswer,
} from 'web/components/usa-map/state-election-map'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useLiveContractWithStatus } from 'web/hooks/use-contract'
import { useContractBySlug } from 'web/hooks/use-contract-by-slug'
import { lookupCandidate } from 'web/lib/politics/candidates'
import { track } from 'web/lib/service/analytics'

// Betting from anywhere on /election without leaving it. A click on a face,
// a line, a cell or a chip opens this dialog on what was clicked: a yes/no
// market's bet panel, or the bet panel for one answer of a multiple choice
// market (with a way to pick another), or, where the click stood for the
// whole market (a grid cell that sums several answers), its answers to
// pick from. The market page is one explicit link at the bottom.
//
// The page's copy of a market can be trimmed or minutes old, so the dialog
// prices from the live market and waits for it to load: a multiple choice
// bet preview prices every answer.

export type BetTarget = {
  // The page's copy of the market, or its slug where the page has only that
  // (the early states' leaders).
  contract?: Contract
  slug?: string
  creator?: string
  // The answer clicked: by id, or, from a slug, by its text or by the party
  // it names (a race board chip shows a party, not an answer).
  answerId?: string
  answerText?: string
  party?: 'D' | 'R'
  // A line above the bet panel, where what was clicked reads differently
  // from the market's answer (the Republican's electoral votes, read from
  // the Democrat's market).
  note?: string
  // A yes/no market's side, where the click stood for one (a ballot
  // measure's No). From `party`, a race's yes/no market reads YES as the
  // Republican winning (as getPartyProbs does), so D opens on NO.
  outcome?: 'YES' | 'NO'
}

// Give up waiting for the live market after this long and offer the market
// page instead of a spinner (a market unlisted since the page was built).
const LOAD_TIMEOUT_MS = 10_000

const PICKER_ANSWERS = 10

export function QuickBet(props: {
  target: BetTarget | undefined
  onClose: () => void
  trackingName: string
}) {
  const { target, onClose, trackingName } = props
  return (
    <Modal
      open={target !== undefined}
      setOpen={(open) => !open && onClose()}
      ariaLabel="Place a bet"
      className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}
    >
      {target &&
        (target.contract ? (
          <LiveBet
            key={`${target.contract.id}-${target.answerId ?? ''}`}
            initial={target.contract}
            target={target}
            onClose={onClose}
            trackingName={trackingName}
          />
        ) : target.slug ? (
          <SlugBet
            key={`${target.slug}-${target.answerText ?? target.party ?? ''}`}
            slug={target.slug}
            target={target}
            onClose={onClose}
            trackingName={trackingName}
          />
        ) : null)}
    </Modal>
  )
}

// Opens a target and remembers it: the state and the dialog for a section.
export function useQuickBet(trackingName: string) {
  const [target, setTarget] = useState<BetTarget>()
  const open = useCallback(
    (t: BetTarget) => {
      track('bet intent', {
        location: trackingName,
        contractId: t.contract?.id,
        slug: t.slug ?? t.contract?.slug,
      })
      setTarget(t)
    },
    [trackingName]
  )
  const dialog = (
    <QuickBet
      target={target}
      onClose={() => setTarget(undefined)}
      trackingName={trackingName}
    />
  )
  return { open, dialog }
}

function SlugBet(props: {
  slug: string
  target: BetTarget
  onClose: () => void
  trackingName: string
}) {
  const { slug, target } = props
  const { contract, error } = useContractBySlug(slug)
  if (error)
    return (
      <div className="flex flex-col gap-3 py-2">
        <p className="text-ink-700 text-sm">Couldn&apos;t load this market.</p>
        <MarketLink href={`/${target.creator ?? 'ManifoldPolitics'}/${slug}`} />
      </div>
    )
  if (!contract) return <LoadingIndicator className="py-8" />
  return <LiveBet {...props} initial={contract} />
}

function LiveBet(props: {
  initial: Contract
  target: BetTarget
  onClose: () => void
  trackingName: string
}) {
  const { initial, target, onClose, trackingName } = props
  const { contract, hasLoaded } = useLiveContractWithStatus(initial)
  // The answer being bet on; undefined while picking.
  const [picked, setPicked] = useState<string | undefined>(target.answerId)
  const [choosing, setChoosing] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    if (hasLoaded) return
    const timer = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [hasLoaded])
  const href = contractPath(contract)

  if (!hasLoaded)
    return timedOut ? (
      <div className="flex flex-col gap-3 py-2">
        <h2 className="text-ink-1000 font-semibold">{contract.question}</h2>
        <p className="text-ink-700 text-sm">
          Couldn&apos;t load this market here.
        </p>
        <MarketLink href={href} />
      </div>
    ) : (
      <LoadingIndicator className="py-8" />
    )
  const closed =
    contract.isResolved || (contract.closeTime ?? Infinity) < Date.now()
  if (closed)
    return (
      <div className="flex flex-col gap-3 py-2">
        <h2 className="text-ink-1000 font-semibold">{contract.question}</h2>
        <p className="text-ink-700 text-sm">This market is closed.</p>
        <MarketLink href={href} />
      </div>
    )

  if (contract.outcomeType === 'BINARY')
    return (
      <div className="flex flex-col gap-2">
        <BuyPanel
          contract={contract as BinaryContract}
          location={trackingName}
          inModal
          initialOutcome={
            target.outcome ?? (target.party === 'D' ? 'NO' : 'YES')
          }
          alwaysShowOutcomeSwitcher
          onBuySuccess={() => setTimeout(onClose, 500)}
          className="!px-0"
        >
          <div className="mb-4 flex flex-col gap-2">
            <h2 className="text-ink-1000 text-lg font-semibold leading-snug">
              {contract.question}
            </h2>
            <span className="text-ink-600 text-sm">
              {formatOdds(getDisplayProbability(contract as BinaryContract))}{' '}
              chance
            </span>
          </div>
        </BuyPanel>
        <MarketLink href={href} />
      </div>
    )

  if (!isMultiCpmm(contract))
    return (
      <div className="flex flex-col gap-3 py-2">
        <h2 className="text-ink-1000 font-semibold">{contract.question}</h2>
        <MarketLink href={href} />
      </div>
    )

  const multi = contract
  const open = multi.answers.filter((a) => a.resolution === undefined)
  // From a slug the page knows the answer's text, not its id: the same
  // text, else the same person however the market spells them.
  const byText = (text: string) =>
    open.find((a) => a.text === text) ??
    open.find((a) => lookupCandidate(a.text).key === lookupCandidate(text).key)
  const answer = choosing
    ? undefined
    : picked
    ? open.find((a) => a.id === picked)
    : target.answerText
    ? byText(target.answerText)
    : target.party
    ? open.find((a) =>
        target.party === 'D'
          ? isDemocraticAnswer(a.text)
          : isRepublicanAnswer(a.text)
      )
    : undefined

  if (answer)
    return (
      <div className="flex flex-col gap-2">
        {target.note && (
          <p className="text-ink-700 bg-canvas-50 rounded-md px-3 py-2 text-sm">
            {target.note}
          </p>
        )}
        <AnswerCpmmBetPanel
          answer={answer}
          contract={multi as CPMMMultiContract}
          outcome="YES"
          closePanel={onClose}
          alwaysShowOutcomeSwitcher
        />
        <div className="flex items-center justify-between gap-3">
          {open.length > 1 ? (
            <button
              type="button"
              onClick={() => setChoosing(true)}
              className="text-primary-700 text-sm font-medium hover:underline"
            >
              Bet on another answer
            </button>
          ) : (
            <span />
          )}
          <MarketLink href={href} />
        </div>
      </div>
    )

  const ranked = sortBy(open, (a) => -getAnswerProbability(multi, a.id))
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-ink-1000 text-lg font-semibold leading-snug">
        {multi.question}
      </h2>
      <ul className="flex flex-col">
        {ranked.slice(0, PICKER_ANSWERS).map((a) => (
          <li key={a.id} className="border-ink-200 border-b last:border-b-0">
            <button
              type="button"
              onClick={() => {
                setPicked(a.id)
                setChoosing(false)
              }}
              className="hover:bg-canvas-50 -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-2 text-left"
            >
              <span className="text-ink-900 min-w-0 flex-1 text-sm">
                {a.text}
              </span>
              <span className="text-ink-1000 text-sm font-semibold tabular-nums">
                {formatOdds(getAnswerProbability(multi, a.id))}
              </span>
              <span className="text-primary-700 text-sm font-medium">Bet</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3">
        <span className="text-ink-500 text-xs">
          {ranked.length > PICKER_ANSWERS
            ? `${ranked.length - PICKER_ANSWERS} more on the market`
            : ''}
        </span>
        <MarketLink href={href} />
      </div>
    </div>
  )
}

function MarketLink(props: { href: string }) {
  return (
    <Link
      href={props.href}
      className="text-ink-500 hover:text-primary-700 shrink-0 text-xs hover:underline"
    >
      Open the market →
    </Link>
  )
}
