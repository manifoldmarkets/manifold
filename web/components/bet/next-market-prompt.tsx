import clsx from 'clsx'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getForcedABTestVariant } from 'common/ab-test'
import {
  BinaryContract,
  Contract,
  contractPath,
  CPMMMultiContract,
} from 'common/contract'
import {
  NEXT_MARKET_PROMPT_BET_EVENT,
  NEXT_MARKET_PROMPT_CLICK_EVENT,
  NEXT_MARKET_PROMPT_SHOWN_EVENT,
  NEXT_MARKET_PROMPT_TEST_NAME,
  NEXT_MARKET_PROMPT_TRIGGER_EVENT,
  NEXT_MARKET_PROMPT_VARIANTS,
  pickNextMarketCandidates,
} from 'common/next-market-prompt'
import { User } from 'common/user'
import { useABTestAssignment } from 'web/hooks/use-ab-test'
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
import { ContractStatusLabel } from '../contract/contracts-table'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { BetDialog, MultiBetDialog } from './bet-dialog'

/**
 * After a bet on the market page, offers three related markets the user has
 * not bet on, each with one-tap bet buttons. Renders nothing until a bet is
 * placed on this page, and nothing at all in the control arm.
 */
// A bet older than this no longer counts as "just placed" when the user
// navigates back to the page.
const PROMPT_TTL_MS = 15 * 60 * 1000
// One trigger event per bet, even if the page remounts.
const trackedTriggerBets = new Set<string>()

export function NextMarketPrompt(props: {
  contract: Contract
  className?: string
}) {
  const { contract, className } = props
  const user = useUser()
  const lastBet = useLastPageBet()
  if (
    !user ||
    !lastBet ||
    lastBet.contractId !== contract.id ||
    Date.now() - lastBet.time > PROMPT_TTL_MS
  ) {
    return null
  }
  return (
    <TriggeredNextMarketPrompt
      // Remount per bet so each one is its own trigger.
      key={lastBet.time}
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
  const triggerKey = lastBet.betId ?? String(lastBet.time)

  useEffect(() => {
    if (!variant || trackedTriggerBets.has(triggerKey)) return
    trackedTriggerBets.add(triggerKey)
    track(NEXT_MARKET_PROMPT_TRIGGER_EVENT, {
      contractId: contract.id,
      variant,
      forced: forcedVariant !== undefined,
      betId: lastBet.betId,
      betAmount: lastBet.amount,
      outcome: lastBet.outcome,
      answerId: lastBet.answerId,
    })
  }, [variant])

  useEffect(() => {
    if (variant !== 'treatment') return
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
          .catch(() => [] as string[]),
      ])
      if (cancelled) return
      const picked = pickNextMarketCandidates(related, {
        sourceContractId: contract.id,
        token: lastBet.token,
        excludeContractIds: new Set(recentlyBet),
        isBlocked: (c) => isContractBlocked(privateUser, c),
      })
      setCandidates(picked)
      if (picked.length > 0) {
        track(NEXT_MARKET_PROMPT_SHOWN_EVENT, {
          contractId: contract.id,
          candidateIds: picked.map((c) => c.id),
          candidateCount: picked.length,
          betAmount: lastBet.amount,
        })
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [variant, contract.id, user.id])

  if (variant !== 'treatment' || !candidates || candidates.length === 0) {
    return null
  }

  return (
    <Col
      className={clsx(
        'bg-canvas-50 border-ink-200 rounded-lg border px-3 py-2',
        className
      )}
    >
      <Row className="items-center justify-between">
        <span className="text-ink-700 text-sm font-medium">Keep going</span>
        <span className="text-ink-400 text-xs">Related markets</span>
      </Row>
      {candidates.map((candidate, position) => (
        <NextMarketRow
          key={candidate.id}
          contract={candidate}
          position={position}
          sourceContractId={contract.id}
          amount={lastBet.amount}
        />
      ))}
    </Col>
  )
}

function NextMarketRow(props: {
  contract: Contract
  position: number
  sourceContractId: string
  amount: number
}) {
  const { contract, position, sourceContractId, amount } = props
  const [openOutcome, setOpenOutcome] = useState<'YES' | 'NO' | undefined>()
  const [openMulti, setOpenMulti] = useState(false)
  const isBinary =
    contract.outcomeType === 'BINARY' && contract.mechanism === 'cpmm-1'

  const trackClick = (outcome: 'YES' | 'NO' | 'bet' | 'link') =>
    track(NEXT_MARKET_PROMPT_CLICK_EVENT, {
      contractId: contract.id,
      sourceContractId,
      position,
      outcome,
    })

  return (
    <Row className="border-ink-100 items-center justify-between gap-3 border-t py-2">
      <Col className="min-w-0 gap-0.5">
        <Link
          href={contractPath(contract)}
          className="hover:text-primary-700 line-clamp-2 text-sm font-medium"
          onClick={() => trackClick('link')}
        >
          {contract.question}
        </Link>
        <ContractStatusLabel
          contract={contract}
          chanceLabel
          className="text-ink-600 text-xs font-semibold"
        />
      </Col>
      {isBinary ? (
        <Row className="shrink-0 gap-1">
          <Button
            size="2xs"
            color="green-outline"
            onClick={() => {
              trackClick('YES')
              setOpenOutcome('YES')
            }}
          >
            Yes
          </Button>
          <Button
            size="2xs"
            color="red-outline"
            onClick={() => {
              trackClick('NO')
              setOpenOutcome('NO')
            }}
          >
            No
          </Button>
        </Row>
      ) : (
        <Button
          size="2xs"
          color="indigo-outline"
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
          onBuySuccess={() =>
            track(NEXT_MARKET_PROMPT_BET_EVENT, {
              contractId: contract.id,
              sourceContractId,
              position,
            })
          }
        />
      )}
      {!isBinary && openMulti && (
        <MultiBetDialog
          contract={contract as CPMMMultiContract}
          open={openMulti}
          setOpen={setOpenMulti}
        />
      )}
    </Row>
  )
}
