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
  isNextMarketPromptCandidate,
  loadNextMarketCandidates,
  NEXT_MARKET_PROMPT_BET_EVENT,
  NEXT_MARKET_PROMPT_CLICK_EVENT,
  NEXT_MARKET_PROMPT_DISMISS_EVENT,
  NEXT_MARKET_PROMPT_EMPTY_EVENT,
  NEXT_MARKET_PROMPT_SHOWN_EVENT,
  NEXT_MARKET_PROMPT_TEST_NAME,
  NEXT_MARKET_PROMPT_TRIGGER_EVENT,
  NEXT_MARKET_PROMPT_VARIANTS,
  NextMarketPromptPlacement,
  NextMarketPromptQueue,
  pickNextMarketCandidates,
  updateNextMarketPromptQueue,
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
// The feed combines up to five ranked lists; 20 per list fits the hydration
// endpoint's 100-ID limit. Bound empty-pool searches per interaction.
const FALLBACK_PAGE_SIZE = 20
const FALLBACK_MAX_PAGES = 3
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
 * After a bet on the market page, offers one related or personalized market
 * the user has not bet on, then another after each suggested-market trade. Renders nothing until a bet is
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
    getNextMarketPromptPlacement(lastBet.location) !== placement
  ) {
    return null
  }
  return (
    <FreshNextMarketPrompt
      // Remount per bet so each one is its own trigger.
      key={lastBet.betId ?? lastBet.time}
      contract={contract}
      lastBet={lastBet}
      user={user}
      className={className}
    />
  )
}

// Freshness is decided once, when a bet's strip mounts. Later re-renders (live
// market updates, balance changes) keep a mounted strip and its open dialog.
function FreshNextMarketPrompt(
  props: Parameters<typeof TriggeredNextMarketPrompt>[0]
) {
  const [fresh] = useState(
    () => Date.now() - props.lastBet.time <= PROMPT_TTL_MS
  )
  return fresh ? <TriggeredNextMarketPrompt {...props} /> : null
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
  const [queue, setQueue] = useState<NextMarketPromptQueue>({
    shown: [],
    remaining: [],
    completedIds: [],
    retiredIds: [],
  })
  const queueRef = useRef(queue)
  const activeDialogId = useRef<string>()
  const candidateSources = useRef(
    new Map<string, 'related' | 'personalized-feed'>()
  )
  const updateQueue = (
    candidates: Contract[],
    options: Parameters<typeof updateNextMarketPromptQueue>[2],
    completedId?: string
  ) => {
    const current = queueRef.current
    // Related neighbours discovered on the next intent outrank feed reserves.
    const priority = (c: Contract) =>
      candidateSources.current.get(c.id) === 'personalized-feed' ? 1 : 0
    const pool = [...current.remaining, ...candidates].sort(
      (a, b) => priority(a) - priority(b)
    )
    const next = updateNextMarketPromptQueue(
      { ...current, remaining: [] },
      pool,
      { ...options, activeDialogContractId: activeDialogId.current },
      completedId
    )
    queueRef.current = next
    setQueue(next)
    return next
  }
  const loadMore = useRef<(contractId: string) => void>()
  const prefetchedSeedIds = useRef(new Set<string>())
  const recentlyBetIds = useRef(new Set<string>())
  const trackedShownIds = useRef(new Set<string>())
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
      dismissed ||
      !privateUser ||
      !isABTestAssignmentCurrent(`user:${user.id}`)
    )
      return
    let cancelled = false
    const isCurrent = () =>
      !cancelled && isABTestAssignmentCurrent(`user:${user.id}`)
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
      if (!isCurrent()) return
      const options = {
        sourceContractId: contract.id,
        token: lastBet.token,
        excludeContractIds: new Set(recentlyBet),
        isBlocked: (c: Contract) => isContractBlocked(privateUser, c),
      }
      // Each seed is fetched at most once while these filters are current.
      // A visible pick warms one level ahead; only a trade earns a reveal.
      const requests = new Map<string, Promise<void>>()
      const hydrate = (
        candidates: Contract[],
        excludeContractIds = options.excludeContractIds
      ) =>
        loadNextMarketCandidates(
          candidates,
          { ...options, excludeContractIds },
          (ids) => api('markets-by-ids', { ids })
        )
      const addCandidates = (
        candidates: Contract[],
        source: 'related' | 'personalized-feed'
      ) => {
        candidates.forEach((c) => {
          if (
            !candidateSources.current.has(c.id) ||
            (source === 'related' &&
              !queueRef.current.shown.some((shown) => shown.id === c.id))
          )
            candidateSources.current.set(c.id, source)
        })
        updateQueue(candidates, options)
      }
      let fallbackOffset = 0
      let fallbackExhausted = false
      let fallbackRequest: Promise<void> | undefined
      let fallbackSeedId: string | undefined
      let fallbackCandidates = 0
      const needsFallback = (seedId?: string) => {
        const q = queueRef.current
        return (
          pickNextMarketCandidates([...q.remaining, ...q.shown], {
            ...options,
            excludeContractIds: new Set([
              ...options.excludeContractIds,
              ...q.completedIds,
              ...q.retiredIds,
              ...(seedId ? [seedId] : []),
            ]),
            count: 1,
          }).length === 0
        )
      }
      const loadFallback = (seedId?: string): Promise<void> => {
        if (!isCurrent() || !recentlyBet || !needsFallback(seedId))
          return Promise.resolve()
        if (fallbackRequest) {
          // A newly revealed pick may need its own reserve after the previous
          // seed's request finishes. Same-seed calls only share the request.
          return fallbackSeedId === seedId
            ? fallbackRequest
            : fallbackRequest.then(() => loadFallback(seedId))
        }
        if (fallbackExhausted) return Promise.resolve()
        fallbackSeedId = seedId
        fallbackRequest = (async () => {
          for (let page = 0; page < FALLBACK_MAX_PAGES; page++) {
            if (!isCurrent() || !needsFallback(seedId)) return
            const { contracts } = await api('get-feed', {
              userId: user.id,
              limit: FALLBACK_PAGE_SIZE,
              offset: fallbackOffset,
            })
            if (!isCurrent()) return
            if (!contracts.length) {
              fallbackExhausted = true
              return
            }
            const { ready } = await hydrate(
              contracts.slice(0, 100),
              new Set([
                ...options.excludeContractIds,
                ...queueRef.current.shown.map((c) => c.id),
              ])
            )
            if (!isCurrent()) return
            fallbackOffset += FALLBACK_PAGE_SIZE
            fallbackCandidates += ready.length
            addCandidates(ready, 'personalized-feed')
          }
        })()
          .catch(() => {
            // Keep existing picks usable; a later intent/completion can retry.
          })
          .finally(() => {
            fallbackRequest = undefined
          })
        return fallbackRequest
      }
      if (recentlyBet) {
        recentlyBetIds.current = options.excludeContractIds
        loadMore.current = (seedId) => {
          if (!isCurrent()) return
          let request = requests.get(seedId)
          if (!request) {
            request = api('get-related-markets', {
              contractId: seedId,
              limit: 25,
            })
              .then(async (r) => {
                if (!isCurrent()) return
                const { ready } = await hydrate(
                  r.marketsFromEmbeddings,
                  new Set([
                    ...options.excludeContractIds,
                    ...queueRef.current.shown.map((c) => c.id),
                  ])
                )
                if (!isCurrent()) return
                addCandidates(ready, 'related')
              })
              .catch(() => {
                requests.delete(seedId)
              })
            requests.set(seedId, request)
          }
          // With no ready reserve, start the personalized fallback alongside
          // the related lookup instead of putting both waits after the trade.
          // If a related result arrives first, it still takes priority.
          void loadFallback(seedId)
        }
      }
      // Unknown history is not an empty history: do not recommend markets
      // we could not check against the user's recent bets.
      const { requestedCount, hydratedCount, ready } = await hydrate(
        recentlyBet ? related : []
      ).catch(() => ({
        requestedCount: related.length,
        hydratedCount: 0,
        ready: [] as Contract[],
      }))
      if (!isCurrent()) return
      addCandidates(ready, 'related')
      // Rewarm visible/intended seeds after a filter refresh.
      prefetchedSeedIds.current.forEach((id) => loadMore.current?.(id))
      await loadFallback()
      if (!isCurrent()) return
      const counts = {
        related: related.length,
        requestedForHydration: requestedCount,
        afterHydration: hydratedCount,
        afterFilters: ready.length,
        fallbackCandidates,
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
          eligible: queueRef.current.shown.map((c) => c.question),
        })
      }
      if (needsFallback()) {
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
      loadMore.current = undefined
    }
  }, [
    variant,
    dismissed,
    contract.id,
    user.id,
    !!privateUser,
    privateUser?.blockedContractIds,
    privateUser?.blockedUserIds,
    privateUser?.blockedByUserIds,
    privateUser?.blockedGroupSlugs,
  ])

  const latestCompletedId = queue.completedIds[queue.completedIds.length - 1]
  const isEligible = (c: Contract) =>
    isNextMarketPromptCandidate(c, { now: Date.now() }) &&
    privateUser &&
    !isContractBlocked(privateUser, c)
  // Reconcile on renders too: a pick can reach its close time without a fetch.
  // Keep a dialog mounted until close reports its trade (or cancellation).
  useEffect(() => {
    if (
      variant !== 'treatment' ||
      dismissed ||
      !privateUser ||
      !isABTestAssignmentCurrent(`user:${user.id}`)
    ) {
      activeDialogId.current = undefined
      return
    }
    if (
      !queue.shown.some(
        (c) =>
          !queue.completedIds.includes(c.id) &&
          !queue.retiredIds.includes(c.id) &&
          c.id !== activeDialogId.current &&
          !isEligible(c)
      )
    )
      return
    updateQueue([], {
      sourceContractId: contract.id,
      token: lastBet.token,
      excludeContractIds: recentlyBetIds.current,
      isBlocked: (c) => isContractBlocked(privateUser, c),
    })
  })
  const candidates = queue.shown.filter(
    (c) =>
      (!queue.completedIds.includes(c.id) || c.id === latestCompletedId) &&
      !queue.retiredIds.includes(c.id) &&
      privateUser &&
      isABTestAssignmentCurrent(`user:${user.id}`) &&
      (isEligible(c) || c.id === activeDialogId.current)
  )
  useEffect(() => {
    if (variant !== 'treatment' || dismissed) return
    const newlyShown = candidates.filter(
      (c) => !trackedShownIds.current.has(c.id)
    )
    if (!newlyShown.length) return
    newlyShown.forEach((c) => trackedShownIds.current.add(c.id))
    // Only visible, actionable picks become seeds. Fetching hidden reserves
    // cannot recursively expand them or create additional impressions.
    newlyShown.forEach((c) => {
      if (queue.completedIds.includes(c.id)) return
      prefetchedSeedIds.current.add(c.id)
      loadMore.current?.(c.id)
    })
    trackPromptEvent(user.id, NEXT_MARKET_PROMPT_SHOWN_EVENT, {
      contractId: contract.id,
      candidateIds: newlyShown.map((c) => c.id),
      candidateSources: Object.fromEntries(
        newlyShown.map((c) => [c.id, candidateSources.current.get(c.id)])
      ),
      candidateCount: newlyShown.length,
      betId: lastBet.betId,
      betAmount: lastBet.amount,
      location: lastBet.location,
      replenishmentIndex: queue.completedIds.length,
    })
  }, [candidates, dismissed, variant])

  if (variant !== 'treatment' || dismissed || candidates.length === 0) {
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
        {candidates.map((candidate) => (
          <NextMarketRow
            key={candidate.id}
            contract={candidate}
            position={queue.shown.findIndex((c) => c.id === candidate.id)}
            sourceContractId={contract.id}
            userId={user.id}
            amount={lastBet.amount}
            completed={queue.completedIds.includes(candidate.id)}
            onBetIntent={() => {
              prefetchedSeedIds.current.add(candidate.id)
              loadMore.current?.(candidate.id)
            }}
            onDialogOpen={() => {
              activeDialogId.current = candidate.id
            }}
            onDialogClose={(traded, closedActiveDialog) => {
              if (
                !privateUser ||
                !isABTestAssignmentCurrent(`user:${user.id}`) ||
                (!traded &&
                  (!closedActiveDialog ||
                    activeDialogId.current !== candidate.id))
              )
                return
              if (closedActiveDialog && activeDialogId.current === candidate.id)
                activeDialogId.current = undefined
              // A placement can finish after its dialog was dismissed. Credit
              // it without releasing a newer dialog or counting a retired slot twice.
              const completedCount = queueRef.current.completedIds.length
              const next = updateQueue(
                [],
                {
                  sourceContractId: contract.id,
                  token: lastBet.token,
                  excludeContractIds: recentlyBetIds.current,
                  isBlocked: (c) => isContractBlocked(privateUser, c),
                },
                traded ? candidate.id : undefined
              )
              if (next.completedIds.length > completedCount)
                loadMore.current?.(candidate.id)
            }}
          />
        ))}
      </Col>
    </Col>
  )
}

type PromptDialogSession = { placedBet: boolean }

function NextMarketRow(props: {
  contract: Contract
  position: number
  sourceContractId: string
  userId: string
  amount: number
  completed: boolean
  onBetIntent: () => void
  onDialogOpen: () => void
  onDialogClose: (traded: boolean, closedActiveDialog: boolean) => void
}) {
  const {
    contract,
    position,
    sourceContractId,
    amount,
    userId,
    completed,
    onBetIntent,
    onDialogOpen,
    onDialogClose,
  } = props
  const [openOutcome, setOpenOutcome] = useState<'YES' | 'NO' | undefined>()
  const [openMulti, setOpenMulti] = useState(false)
  const trackedBetIds = useRef(new Set<string>())
  const activeDialog = useRef<PromptDialogSession>()
  const session = activeDialog.current
  const onDialogCloseRef = useRef(onDialogClose)
  onDialogCloseRef.current = onDialogClose
  const openDialog = () => {
    activeDialog.current = { placedBet: false }
    onDialogOpen()
    onBetIntent()
  }
  const closeDialog = (closedSession: PromptDialogSession) => {
    const closedActiveDialog = activeDialog.current === closedSession
    if (closedActiveDialog) {
      activeDialog.current = undefined
      setOpenOutcome(undefined)
      setOpenMulti(false)
    }
    // Dialogs can auto-close on a timer; use the latest block/history filters.
    // An older timer must not close a reopened dialog or borrow its trade status.
    onDialogCloseRef.current(closedSession.placedBet, closedActiveDialog)
  }
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

  const trackBetPlaced = (bet: Bet, session: PromptDialogSession) => {
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
    session.placedBet = true
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
      {completed ? (
        <span className="text-ink-500 shrink-0 text-xs">Traded ✓</span>
      ) : isBinary && yesProb !== undefined ? (
        <Row className="shrink-0 gap-1">
          <Button
            size="xs"
            color="green"
            onClick={() => {
              trackClick('YES')
              openDialog()
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
              openDialog()
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
            openDialog()
            setOpenMulti(true)
          }}
        >
          Bet
        </Button>
      )}
      {isBinary && openOutcome && session && (
        <BetDialog
          contract={contract as BinaryContract}
          open
          setOpen={(open) => {
            if (!open) closeDialog(session)
          }}
          trackingLocation="next market prompt"
          initialOutcome={openOutcome}
          initialAmount={amount}
          onBetPlaced={(bet) => trackBetPlaced(bet, session)}
        />
      )}
      {!isBinary && openMulti && session && (
        <MultiBetDialog
          contract={contract as CPMMMultiContract}
          open={openMulti}
          setOpen={(open) => {
            if (!open) closeDialog(session)
          }}
          trackingLocation="next market prompt"
          onBetPlaced={(bet) => trackBetPlaced(bet, session)}
        />
      )}
    </Row>
  )
}
