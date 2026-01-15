import { RefreshIcon } from '@heroicons/react/outline'
import clsx from 'clsx'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  Leaderboard,
  LoadingLeaderboard,
  type LeaderboardColumn,
  type LeaderboardEntry,
} from 'web/components/leaderboard'
import { Page } from 'web/components/layout/page'
import { formatMoney, formatWithCommas } from 'common/util/format'
import { useEffect, useState } from 'react'
import { SEO } from 'web/components/SEO'
import { BETTORS } from 'common/user'
import { useUser } from 'web/hooks/use-user'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { getUserReferralsInfo } from 'common/supabase/referrals'
import { db } from 'web/lib/supabase/db'
import { getCreatorRank, getProfitRank } from 'web/lib/supabase/users'
import { type LiteGroup, TOPIC_KEY } from 'common/group'
import { TopicPillSelector } from 'web/components/topics/topic-selector'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'
import { useTopicFromRouter } from 'web/hooks/use-topic-from-router'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { Button } from 'web/components/buttons/button'
import { buildArray } from 'common/util/array'
import { getCurrentPortfolio } from 'common/supabase/portfolio-metrics'
import Link from 'next/link'

const LEADERBOARD_TYPES = [
  { name: 'Profit', value: 'profit' },
  { name: 'Loss', value: 'loss' },
  { name: 'Volume', value: 'volume' },
  { name: 'Creators', value: 'creator' },
  { name: 'Referrals', value: 'referral' },
] as const

type LeaderboardType = (typeof LEADERBOARD_TYPES)[number]['value']

type Entry = LeaderboardEntry & {
  totalReferredProfit?: number
  isBannedFromPosting?: boolean
}
type MyEntry = Omit<Entry, 'userId'>
type MyScores = {
  [key in LeaderboardType]?: { mana: MyEntry; cash: MyEntry }
}

export default function Leaderboards() {
  const [topicSlug, setTopicSlug] = usePersistentQueryState(TOPIC_KEY, '')
  const topicFromRouter = useTopicFromRouter(topicSlug)
  const [topic, setTopic] = useState<LiteGroup | undefined>()
  const [type, setType] = useState<LeaderboardType>('profit')

  const [myScores, setMyScores] = useState<MyScores>()
  const user = useUser()

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const profitRank = await getProfitRank(user.id)
      const tradersRank = await getCreatorRank(user.id)
      const referrerInfo = await getUserReferralsInfo(user.id, db)

      const p = await getCurrentPortfolio(user.id, db)
      let manaProfit = 0,
        cashProfit = 0
      if (p) {
        manaProfit =
          p.profit ??
          p.balance + p.spiceBalance + p.investmentValue - p.totalDeposits
        cashProfit = p.cashBalance + p.cashInvestmentValue - p.totalCashDeposits
      }

      const { count: numUsers } = await db
        .from('users')
        .select('*', { head: true, count: 'exact' })

      setMyScores({
        profit: {
          mana: { rank: profitRank, score: manaProfit },
          cash: { rank: profitRank, score: cashProfit },
        },
        loss: {
          mana: { rank: numUsers ?? NaN - profitRank, score: manaProfit },
          cash: { rank: numUsers ?? NaN - profitRank, score: cashProfit },
        },
        creator: {
          mana: { rank: tradersRank, score: user.creatorTraders.allTime },
          cash: { rank: tradersRank, score: user.creatorTraders.allTime },
        },
        referral: {
          mana: {
            rank: referrerInfo.rank,
            score: referrerInfo.total_referrals ?? 0,
            totalReferredProfit: referrerInfo.total_referred_profit ?? 0,
          },
          cash: {
            rank: referrerInfo.rank,
            score: referrerInfo.total_referrals ?? 0,
            totalReferredProfit: referrerInfo.total_referred_cash_profit ?? 0,
          },
        },
      })
    })()
  }, [user?.id])

  useEffect(() => {
    setTopic(topicFromRouter)
  }, [topicFromRouter])
  useEffect(() => {
    if (topic) {
      setTopicSlug(topic.slug)
    } else {
      setTopicSlug('')
    }
  }, [topic])

  const token = 'MANA'

  const {
    data: entries,
    error,
    refresh,
    loading,
  } = useAPIGetter('leaderboard', {
    kind: type,
    groupId: topic?.id,
    token,
    limit: 50,
  })

  const shouldInsertMe =
    user && entries && !entries.find((e) => e.userId === user.id) && !topic
  const data = myScores?.[type]?.mana
  const myEntry = shouldInsertMe && data ? { userId: user.id, ...data } : null

  const allColumns: { [key in LeaderboardType]: LeaderboardColumn<Entry>[] } = {
    profit: [
      { header: 'Profit', renderCell: (c) => formatMoney(c.score, token) },
    ],

    loss: [
      {
        header: 'Loss',
        renderCell: (c) => (
          <span className={c.score < 0 ? 'text-scarlet-500' : 'text-ink-400'}>
            {formatMoney(c.score, token)}
          </span>
        ),
      },
    ],

    volume: [
      { header: 'Volume', renderCell: (c) => formatMoney(c.score, token) },
    ],

    creator: [
      { header: 'Traders', renderCell: (c) => formatWithCommas(c.score) },
    ],

    referral: [
      { header: 'Referrals', renderCell: (c) => c.score },
      {
        header: (
          <span className="flex items-center gap-1">
            Referred profits
            <InfoTooltip text="Total profit earned by referred users" />
          </span>
        ),
        renderCell: (c) => formatMoney(c.totalReferredProfit ?? 0, token),
      },
    ],
  }

  const columns = allColumns[type]

  return (
    <Page trackPageView={'leaderboards'}>
      <SEO
        title="Leaderboards"
        description={`Manifold's leaderboards show the top ${BETTORS}, question creators, and referrers.`}
        url="/leaderboards"
      />

      <Col className="mx-auto w-full max-w-2xl gap-6 px-4 pb-8 pt-4">
        {/* Header */}
        <Col className="gap-1">
          <Row className="items-center justify-between">
            <h1 className="text-primary-700 text-2xl font-semibold">
              Leaderboard
            </h1>
            <Link
              href="/leagues"
              className="text-ink-500 hover:text-ink-700 text-sm"
            >
              Monthly leagues →
            </Link>
          </Row>
          <p className="text-ink-500 text-sm">
            All-time top traders on Manifold
          </p>
        </Col>

        {/* User's rank if available */}
        {user && myScores?.[type] && (
          <div className="bg-canvas-50 border-ink-200 rounded-lg border px-4 py-3">
            <Row className="items-center justify-between">
              <span className="text-ink-600 text-sm">Your rank</span>
              <span className="text-ink-900 text-lg font-semibold tabular-nums">
                #{data?.rank?.toLocaleString() ?? '—'}
              </span>
            </Row>
          </div>
        )}

        {/* Filters */}
        <Row className="flex-wrap items-center gap-3">
          {type !== 'referral' && (
            <TopicPillSelector topic={topic} setTopic={setTopic} />
          )}
          <button
            onClick={refresh}
            className="text-ink-400 hover:text-ink-600 rounded p-1.5 transition-colors hover:bg-canvas-100"
            title="Refresh"
          >
            <RefreshIcon className="h-4 w-4" />
          </button>
        </Row>

        {/* Type Tabs */}
        <div className="border-ink-200 border-b">
          <Row className="-mb-px gap-1">
            {LEADERBOARD_TYPES.map((t) => {
              const isSelected = t.value === type
              return (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={clsx(
                    'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                    isSelected
                      ? 'border-primary-500 text-primary-600'
                      : 'text-ink-500 hover:text-ink-700 border-transparent'
                  )}
                >
                  {t.name}
                </button>
              )
            })}
          </Row>
        </div>

        {/* Leaderboard Table */}
        <div className="bg-canvas-0 border-ink-200 overflow-hidden rounded-lg border">
          {loading ? (
            <LoadingLeaderboard columns={columns} />
          ) : entries ? (
            <Leaderboard
              entries={buildArray(entries, myEntry)}
              columns={columns}
              highlightUserId={user?.id}
            />
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <span className="text-ink-600 text-sm">
                Error loading leaderboard
              </span>
              <span className="text-ink-400 text-xs">{error.message}</span>
              <Button onClick={refresh} size="sm" color="gray-outline">
                Try again
              </Button>
            </div>
          ) : null}
        </div>
      </Col>
    </Page>
  )
}
