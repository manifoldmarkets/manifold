import { XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { maxBy } from 'lodash'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { getForcedABTestVariant } from 'common/ab-test'
import { Bet } from 'common/bet'
import { getProbability } from 'common/calculate'
import {
  BinaryContract,
  Contract,
  contractPath,
  CPMMMultiContract,
} from 'common/contract'
import {
  getNextMarketPromptPlacement,
  NEXT_MARKET_PROMPT_BET_EVENT,
  NEXT_MARKET_PROMPT_CLICK_EVENT,
  NEXT_MARKET_PROMPT_DISMISS_EVENT,
  NEXT_MARKET_PROMPT_EMPTY_EVENT,
  NEXT_MARKET_PROMPT_SHOWN_EVENT,
  NEXT_MARKET_PROMPT_TEST_NAME,
  NEXT_MARKET_PROMPT_TRIGGER_EVENT,
  NEXT_MARKET_PROMPT_VARIANTS,
  NextMarketPromptPlacement,
  pickNextMarketCandidates,
} from 'common/next-market-prompt'
import { User } from 'common/user'
import { formatPercent } from 'common/util/format'
import {
  isABTestAssignmentCurrent,
  useABTestAssignment,
} from 'web/hooks/use-ab-test'
import { useEffectCheckEquality } from 'web/hooks/use-effect-check-equality'
import { useIsMarketPageBet } from 'web/hooks/use-answer-bet-tracking-location'
import {
  LastPageBet,
  useLastPageBet,
  useNextMarketPromptOverride,
} from 'web/hooks/use-next-market-prompt'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { isContractBlocked } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { BetDialog, MultiBetDialog } from './bet-dialog'

// A bet older than this no longer counts as "just placed" when the user
// navigates back to the page.
const PROMPT_TTL_MS = 15 * 60 * 1000
// One trigger event per bet, even if the page remounts.
const trackedTriggerBets = new Set<string>()

// Analytics uses Firebase's current identity, which can change before the
// app's user context catches up (including while candidate requests run).
const trackPromptEvent = (
  userId: string,
  name: string,
  properties: Parameters<typeof track>[1]
) => {
  if (isABTestAssignmentCurrent(`user:${userId}`)) track(name, properties)
}

/**
 * After a bet on the market page, offers three related markets the user has
 * not bet on, each with one-tap bet buttons. Renders nothing until a bet is
 * placed on this page, and nothing at all in the control arm.
 *
 * Mount one instance per placement: `panel` inside the binary bet panel,
 * `page` under the overview for answer-panel bets.
 */
export function NextMarketPrompt(props: {
  contract: Contract
  placement: NextMarketPromptPlacement
  className?: string
}) {
  const { contract, placement, className } = props
  const user = useUser()
  const lastBet = useLastPageBet()
  const isMarketPageBet = useIsMarketPageBet()
  if (
    !isMarketPageBet ||
    !user ||
    !isABTestAssignmentCurrent(`user:${user.id}`) ||
    !lastBet ||
    lastBet.userId !== user.id ||
    lastBet.contractId !== contract.id ||
    getNextMarketPromptPlacement(lastBet.location) !== placement ||
    Date.now() - lastBet.time > PROMPT_TTL_MS
  ) {
    return null
  }
  return (
    <TriggeredNextMarketPrompt
      // Remount per bet so each one is its own trigger.
      key={lastBet.betId ?? lastBet.time}
      contract={contract}
      lastBet={lastBet}
      user={user}
      className={className}
    />
  )
}

function TriggeredNextMarketPrompt(props: {
  contract: Contract
  lastBet: LastPageBet
  user: User
  className?: string
}) {
  const { contract, lastBet, user, className } = props
  const privateUser = usePrivateUser()
  const { ready: overrideReady, override } = useNextMarketPromptOverride()
  const forcedVariant =
    override ?? getForcedABTestVariant(user.id, NEXT_MARKET_PROMPT_VARIANTS)
  const assignment = useABTestAssignment(
    NEXT_MARKET_PROMPT_TEST_NAME,
    NEXT_MARKET_PROMPT_VARIANTS,
    {
      isReady: overrideReady,
      userId: user.id,
      forcedVariant,
      trackingProperties: { contractId: contract.id },
    }
  )
  const variant = assignment?.variant
  const [candidates, setCandidates] = useState<Contract[] | undefined>()
  const [dismissed, setDismissed] = useState(false)
  const triggerKey = lastBet.betId ?? String(lastBet.time)

  useEffect(() => {
    if (
      !variant ||
      !isABTestAssignmentCurrent(`user:${user.id}`) ||
      trackedTriggerBets.has(triggerKey)
    )
      return
    trackedTriggerBets.add(triggerKey)
    trackPromptEvent(user.id, NEXT_MARKET_PROMPT_TRIGGER_EVENT, {
      contractId: contract.id,
      variant,
      forced: forcedVariant !== undefined,
      betId: lastBet.betId,
      betAmount: lastBet.amount,
      outcome: lastBet.outcome,
      answerId: lastBet.answerId,
      location: lastBet.location,
    })
  }, [variant])

  useEffectCheckEquality(() => {
    if (
      variant !== 'treatment' ||
      !privateUser ||
      !isABTestAssignmentCurrent(`user:${user.id}`)
    )
      return
    let cancelled = false
    const load = async () => {
      const [related, recentlyBet] = await Promise.all([
        api('get-related-markets', { contractId: contract.id, limit: 25 })
          .then((r) => r.marketsFromEmbeddings)
          .catch(() => [] as Contract[]),
        api('get-user-contract-metrics-with-contracts', {
          userId: user.id,
          limit: 100,
          order: 'lastBetTime',
        })
          .then((r) => Object.keys(r.metricsByContract))
          .catch(() => undefined),
      ])
      if (cancelled || !isABTestAssignmentCurrent(`user:${user.id}`)) return
      // Unknown history is not an empty history: do not recommend markets
      // we could not check against the user's recent bets.
      const picked = pickNextMarketCandidates(recentlyBet ? related : [], {
        sourceContractId: contract.id,
        token: lastBet.token,
        excludeContractIds: new Set(recentlyBet),
        // Hydrate the eligible pool before applying topic blocks and the cap:
        // get-related-markets strips both answers and groupSlugs.
        count: related.length,
      })
      // The related-markets endpoint strips answers from multiple-choice
      // markets, which the bet dialog needs. Hydrate the picks.
      const full = picked.length
        ? await api('markets-by-ids', { ids: picked.map((c) => c.id) }).catch(
            () => [] as Contract[]
          )
        : []
      if (cancelled || !isABTestAssignmentCurrent(`user:${user.id}`)) return
      const ready = pickNextMarketCandidates(picked, {
        sourceContractId: contract.id,
        token: lastBet.token,
        excludeContractIds: new Set(recentlyBet),
        hydratedContracts: full,
        isBlocked: (c) => isContractBlocked(privateUser, c),
      })
      setCandidates(ready)
      const counts = {
        related: related.length,
        afterFilters: picked.length,
        afterHydration: ready.length,
        recentlyBetFailed: recentlyBet === undefined,
        recentlyBetExcluded: related.filter((c) => recentlyBet?.includes(c.id))
          .length,
      }
      if (override !== undefined) {
        // QA override active: say why the strip did or did not appear.
        console.info('[next-market-prompt]', {
          variant,
          market: contract.id,
          ...counts,
          shown: ready.map((c) => c.question),
        })
      }
      if (ready.length > 0) {
        trackPromptEvent(user.id, NEXT_MARKET_PROMPT_SHOWN_EVENT, {
          contractId: contract.id,
          candidateIds: ready.map((c) => c.id),
          candidateCount: ready.length,
          betAmount: lastBet.amount,
          location: lastBet.location,
        })
      } else {
        trackPromptEvent(user.id, NEXT_MARKET_PROMPT_EMPTY_EVENT, {
          contractId: contract.id,
          ...counts,
          location: lastBet.location,
        })
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [
    variant,
    contract.id,
    user.id,
    !!privateUser,
    privateUser?.blockedContractIds,
    privateUser?.blockedUserIds,
    privateUser?.blockedByUserIds,
    privateUser?.blockedGroupSlugs,
  ])

  if (
    variant !== 'treatment' ||
    dismissed ||
    !candidates ||
    candidates.length === 0
  ) {
    return null
  }

  return (
    <Col
      className={clsx(
        'bg-primary-50 border-primary-200 rounded-lg border px-3 pb-1 pt-2',
        className
      )}
    >
      <Row className="items-center justify-between">
        <span className="text-primary-700 text-xs font-semibold uppercase tracking-wide">
          Picked for you
        </span>
        <button
          type="button"
          className="text-ink-400 hover:text-ink-700 -mr-1 rounded p-1 transition-colors"
          aria-label="Dismiss"
          onClick={() => {
            setDismissed(true)
            trackPromptEvent(user.id, NEXT_MARKET_PROMPT_DISMISS_EVENT, {
              contractId: contract.id,
              candidateCount: candidates.length,
            })
          }}
        >
          <XIcon className="h-4 w-4" />
        </button>
      </Row>
      <Col className="divide-ink-200 divide-y">
        {candidates.map((candidate, position) => (
          <NextMarketRow
            key={candidate.id}
            contract={candidate}
            position={position}
            sourceContractId={contract.id}
            userId={user.id}
            amount={lastBet.amount}
          />
        ))}
      </Col>
    </Col>
  )
}

function NextMarketRow(props: {
  contract: Contract
  position: number
  sourceContractId: string
  userId: string
  amount: number
}) {
  const { contract, position, sourceContractId, amount, userId } = props
  const [openOutcome, setOpenOutcome] = useState<'YES' | 'NO' | undefined>()
  const [openMulti, setOpenMulti] = useState(false)
  const trackedBetIds = useRef(new Set<string>())
  const isBinary =
    contract.outcomeType === 'BINARY' && contract.mechanism === 'cpmm-1'
  const yesProb =
    contract.outcomeType === 'BINARY' ? getProbability(contract) : undefined
  const leadingAnswer =
    contract.outcomeType === 'MULTIPLE_CHOICE'
      ? maxBy(
          contract.answers.filter((a) => !a.isOther),
          (a) => a.prob
        )
      : undefined

  const trackClick = (outcome: 'YES' | 'NO' | 'bet' | 'link') =>
    trackPromptEvent(userId, NEXT_MARKET_PROMPT_CLICK_EVENT, {
      contractId: contract.id,
      sourceContractId,
      position,
      outcome,
    })

  const trackBetPlaced = (bet: Bet) => {
    if (
      bet.userId !== userId ||
      bet.contractId !== contract.id ||
      !isABTestAssignmentCurrent(`user:${userId}`) ||
      !Number.isFinite(bet.amount) ||
      bet.amount <= 0 ||
      trackedBetIds.current.has(bet.id)
    )
      return
    trackedBetIds.current.add(bet.id)
    trackPromptEvent(userId, NEXT_MARKET_PROMPT_BET_EVENT, {
      contractId: contract.id,
      sourceContractId,
      position,
      betId: bet.id,
      betAmount: bet.amount,
      outcome: bet.outcome,
      answerId: bet.answerId,
    })
  }

  return (
    <Row className="items-center justify-between gap-3 py-2">
      <Col className="min-w-0 gap-0.5">
        <Link
          href={contractPath(contract)}
          className="hover:text-primary-700 line-clamp-2 text-sm font-medium"
          onClick={() => trackClick('link')}
        >
          {contract.question}
        </Link>
        {leadingAnswer && (
          <span className="text-ink-500 line-clamp-1 text-xs">
            {leadingAnswer.text}{' '}
            <span className="font-semibold">
              {formatPercent(leadingAnswer.prob)}
            </span>
          </span>
        )}
      </Col>
      {isBinary && yesProb !== undefined ? (
        <Row className="shrink-0 gap-1">
          <Button
            size="xs"
            color="green"
            onClick={() => {
              trackClick('YES')
              setOpenOutcome('YES')
            }}
          >
            Yes {formatPercent(yesProb)}
          </Button>
          <Button
            size="xs"
            color="red"
            onClick={() => {
              trackClick('NO')
              setOpenOutcome('NO')
            }}
          >
            No {formatPercent(1 - yesProb)}
          </Button>
        </Row>
      ) : (
        <Button
          size="xs"
          color="indigo"
          className="shrink-0"
          onClick={() => {
            trackClick('bet')
            setOpenMulti(true)
          }}
        >
          Bet
        </Button>
      )}
      {isBinary && openOutcome && (
        <BetDialog
          contract={contract as BinaryContract}
          open
          setOpen={(open) => {
            if (!open) setOpenOutcome(undefined)
          }}
          trackingLocation="next market prompt"
          initialOutcome={openOutcome}
          initialAmount={amount}
          onBetPlaced={trackBetPlaced}
        />
      )}
      {!isBinary && openMulti && (
        <MultiBetDialog
          contract={contract as CPMMMultiContract}
          open={openMulti}
          setOpen={setOpenMulti}
          trackingLocation="next market prompt"
          onBetPlaced={trackBetPlaced}
        />
      )}
    </Row>
  )
}
