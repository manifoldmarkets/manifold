import clsx from 'clsx'
import { keyBy } from 'lodash'
import { type ComponentProps, useEffect, useState } from 'react'

import { getDisplayProbability } from 'common/calculate'
import type { BinaryContract } from 'common/contract'
import { ENV } from 'common/envs/constants'
import { WELCOME_FLOW_TOPICS } from 'common/topics'
import type { User } from 'common/user'
import { formatMoney, formatPercent } from 'common/util/format'
import { pickFirstBetMarkets } from 'common/welcome-flow'
import { BuyPanel } from 'web/components/bet/bet-panel'
import { MarketRowSkeleton } from 'web/components/browse-v2/market-card'
import { useLiveContract } from 'web/hooks/use-contract'
import { api, followTopic, followUser } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'

const topics = keyBy(WELCOME_FLOW_TOPICS, 'name')
const chipNames = [
  'Popular',
  'Politics',
  'Sports',
  'AI',
  'Technology',
  'Science',
  'Culture',
  'Crypto',
  'Finance',
  'Gaming',
  'Movies & TV',
  'Music',
]
const topicAccounts: Partial<Record<string, string>> = {
  Politics: 'vuI5upWB8yU00rP7yxj95J2zd952',
  AI: '8lZo8X5lewh4hnCoreI7iSc0GxK2',
}
const location = 'onboarding first bet'
type Outcome = 'YES' | 'NO'

export default function WelcomeFirstBet({
  user,
  marketsByTopic,
  saveMarkets,
  followedTopics,
  finish,
}: {
  user: User
  marketsByTopic: Partial<Record<string, BinaryContract[]>>
  saveMarkets: (topic: string, markets: BinaryContract[]) => void
  followedTopics: Set<string>
  finish: (outcome: 'bet' | 'no-markets') => Promise<void>
}) {
  const [topic, setTopic] = useState('Popular')
  const [ticket, setTicket] = useState<{
    contractId: string
    outcome: Outcome
  }>()
  const markets = marketsByTopic[topic]

  useEffect(() => {
    if (markets) return
    let active = true
    const groupId = topics[topic]?.groupId
    api('search-markets-full', {
      term: '',
      filter: 'open',
      sort: 'score',
      contractType: 'BINARY',
      token: 'MANA',
      limit: 24,
      ...(groupId && { gids: groupId }),
    })
      .then((contracts) => {
        if (!active) return
        const picks = pickFirstBetMarkets(
          contracts,
          Date.now(),
          3,
          ENV === 'PROD' ? 10 : 1
        )
        if (picks.length === 0 && topic === 'Popular') {
          void finish('no-markets')
        } else saveMarkets(topic, picks)
      })
      .catch((error) => {
        if (!active) return
        console.error('Could not load onboarding markets', error)
        void finish('no-markets')
      })
    return () => {
      active = false
    }
  }, [topic, markets, finish, saveMarkets])

  const selectTopic = (name: string) => {
    if (name === topic) return
    setTicket(undefined)
    setTopic(name)
    track('onboarding select topic', { name })
    const groupId = topics[name]?.groupId
    if (!groupId || followedTopics.has(groupId)) return
    followedTopics.add(groupId)
    void followTopic({ groupId }).catch(console.error)
    const account = topicAccounts[name]
    if (account) void followUser(account).catch(console.error)
  }

  const openTicket = (contract: BinaryContract, outcome: Outcome) => {
    track('bet intent', {
      location,
      outcome,
      token: contract.token,
      contractId: contract.id,
      signedOut: false,
    })
    setTicket({ contractId: contract.id, outcome })
  }

  return (
    <>
      <div className="shrink-0 space-y-2">
        <h2 className="text-2xl font-semibold">Make your first prediction</h2>
        <p className="text-ink-700 text-sm">
          You have {formatMoney(user.balance)} to start. Pick Yes or No and win
          mana if you're right. The percentage is the crowd's current forecast.
        </p>
      </div>
      <div
        role="group"
        aria-label="Market topics"
        className="scrollbar-hide flex shrink-0 gap-2 overflow-x-auto pb-1"
      >
        {chipNames.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={topic === name}
            onClick={() => selectTopic(name)}
            className={clsx(
              'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium',
              topic === name
                ? 'bg-primary-600 text-white'
                : 'bg-canvas-100 text-ink-700 hover:bg-canvas-200'
            )}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        className="divide-ink-200 min-h-0 divide-y overflow-y-auto overscroll-contain"
        aria-busy={markets === undefined}
      >
        {markets === undefined ? (
          <>
            <MarketRowSkeleton />
            <MarketRowSkeleton />
            <MarketRowSkeleton />
          </>
        ) : markets.length === 0 ? (
          <p className="text-ink-600 py-3 text-sm" role="status">
            Nothing open here right now
          </p>
        ) : (
          markets.map((contract) => (
            <div key={contract.id} className="space-y-2 py-3">
              <div className="flex items-center gap-2">
                <span className="line-clamp-2 min-w-0 flex-1 text-sm font-medium">
                  {contract.question}
                </span>
                <span className="text-ink-700 text-sm font-semibold tabular-nums">
                  {formatPercent(getDisplayProbability(contract))}
                </span>
                {/* The open ticket has its own live Yes/No selector. */}
                {ticket?.contractId !== contract.id &&
                  (['YES', 'NO'] as const).map((outcome) => (
                    <button
                      key={outcome}
                      type="button"
                      className={clsx(
                        'rounded-md px-2.5 py-1.5 text-sm font-semibold transition-colors hover:text-white',
                        outcome === 'YES'
                          ? 'bg-teal-600/10 text-teal-700 hover:bg-teal-600 dark:text-teal-400'
                          : 'bg-scarlet-500/10 text-scarlet-600 hover:bg-scarlet-500 dark:text-scarlet-400'
                      )}
                      aria-label={`Predict ${outcome} on ${contract.question}`}
                      onClick={() => openTicket(contract, outcome)}
                    >
                      {outcome === 'YES' ? 'Yes' : 'No'}
                    </button>
                  ))}
              </div>
              {ticket?.contractId === contract.id && (
                // The ticket pulls itself out by -mx-2 below sm; pad it back
                // so the list doesn't scroll sideways.
                <div className="px-2 sm:px-0">
                  <LiveBuyPanel
                    contract={contract}
                    inModal
                    compact
                    initialOutcome={ticket.outcome}
                    location={location}
                    onBetPlaced={(bet) => {
                      track('onboarding first bet placed', {
                        contractId: contract.id,
                        topic,
                        amount: bet.amount,
                      })
                      void finish('bet')
                    }}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  )
}

function LiveBuyPanel({ contract, ...props }: ComponentProps<typeof BuyPanel>) {
  const liveContract = useLiveContract(contract)
  return <BuyPanel contract={liveContract} {...props} />
}
