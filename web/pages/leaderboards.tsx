import {
  RefreshIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  ChartBarIcon,
  UserGroupIcon,
  SparklesIcon,
} from '@heroicons/react/outline'
import { StarIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import TrophyIcon from 'web/lib/icons/trophy-icon.svg'
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

const LEADERBOARD_TYPES = [
  {
    name: 'Profit',
    value: 'profit',
    icon: TrendingUpIcon,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/20',
    borderColor: 'border-emerald-500',
  },
  {
    name: 'Loss',
    value: 'loss',
    icon: TrendingDownIcon,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/20',
    borderColor: 'border-rose-500',
  },
  {
    name: 'Volume',
    value: 'volume',
    icon: ChartBarIcon,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500',
  },
  {
    name: 'Creators',
    value: 'creator',
    icon: UserGroupIcon,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/20',
    borderColor: 'border-purple-500',
  },
  {
    name: 'Referrals',
    value: 'referral',
    icon: StarIcon,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/20',
    borderColor: 'border-amber-500',
  },
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

  const currentTypeConfig = LEADERBOARD_TYPES.find((t) => t.value === type)!

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
          <span>
            Referred profits
            <InfoTooltip text={'Total profit earned by referred users'} />
          </span>
        ),
        renderCell: (c) => formatMoney(c.totalReferredProfit ?? 0, token),
      },
    ],
  }

  const columns = allColumns[type]

  return (
    <Page trackPageView={'leaderboards'} hideFooter className="!bg-transparent">
      <SEO
        title="Leaderboards"
        description={`Manifold's leaderboards show the top ${BETTORS}, question creators, and referrers.`}
        url="/leaderboards"
      />

      {/* Funky gradient backgrounds */}
      {/* Light mode */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-white dark:hidden" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-amber-50/80 to-white dark:hidden" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-yellow-100/50 via-transparent to-transparent dark:hidden" />
      {/* Dark mode */}
      <div className="pointer-events-none fixed inset-0 -z-10 hidden bg-slate-900 dark:block" />
      <div className="pointer-events-none fixed inset-0 -z-10 hidden bg-gradient-to-br from-amber-950/30 via-slate-900 to-yellow-950/20 dark:block" />
      <div className="pointer-events-none fixed inset-0 -z-10 hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-800/20 via-transparent to-transparent dark:block" />
      <div className="pointer-events-none fixed inset-0 -z-10 hidden bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-yellow-900/30 via-transparent to-transparent dark:block" />

      <Col className="mx-auto w-full max-w-xl gap-4 px-2 pb-8 pt-4">
        {/* Hero Section */}
        <div
          className={clsx(
            'relative overflow-hidden rounded-2xl p-6',
            'bg-gradient-to-br from-amber-100 via-yellow-100 to-orange-100',
            'dark:from-amber-900 dark:via-yellow-900 dark:to-orange-900'
          )}
        >
          {/* Decorative elements */}
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-yellow-300/30 blur-3xl dark:bg-yellow-500/20" />
          <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-amber-300/30 blur-2xl dark:bg-amber-500/20" />
          <SparklesIcon className="absolute right-4 top-4 h-6 w-6 text-yellow-500/60 dark:text-yellow-400/60" />

          <Row className="relative z-10 items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-500 shadow-lg shadow-amber-500/30">
              <TrophyIcon className="h-10 w-10 text-white" />
            </div>
            <Col className="gap-1">
              <h1 className="text-3xl font-black text-amber-900 dark:text-white">
                Leaderboard
              </h1>
              <p className="text-sm text-amber-700 dark:text-amber-200">
                The all-time greatest traders on Manifold
              </p>
            </Col>
          </Row>

          {/* User's rank summary if available */}
          {user && myScores?.[type] && (
            <div className="relative z-10 mt-4 rounded-xl bg-amber-200/50 px-4 py-3 backdrop-blur dark:bg-black/20">
              <Row className="items-center justify-between">
                <span className="text-sm text-amber-800 dark:text-amber-200">
                  Your rank
                </span>
                <span className="text-xl font-bold text-amber-900 dark:text-white">
                  #{data?.rank?.toLocaleString() ?? '—'}
                </span>
              </Row>
            </div>
          )}
        </div>

        {/* Filters Row */}
        <Row className="flex-wrap items-center gap-2">
          {type !== 'referral' && (
            <TopicPillSelector topic={topic} setTopic={setTopic} />
          )}
          <button
            onClick={refresh}
            className={clsx(
              'flex items-center justify-center rounded-full p-2 transition-all',
              'hover:bg-ink-200 active:bg-ink-300'
            )}
          >
            <RefreshIcon className="text-ink-500 h-4 w-4" />
          </button>
        </Row>

        {/* Type Pills */}
        <Row className="scrollbar-hide -mx-2 gap-2 overflow-x-auto px-2 pb-1">
          {LEADERBOARD_TYPES.map((t) => {
            const isSelected = t.value === type
            const Icon = t.icon
            return (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={clsx(
                  'flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 transition-all',
                  'border-2',
                  isSelected
                    ? `${t.bgColor} ${t.borderColor} ${t.color} shadow-lg`
                    : 'border-ink-200 hover:border-ink-300 bg-canvas-0 text-ink-600'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="font-medium">{t.name}</span>
              </button>
            )
          })}
        </Row>

        {/* Leaderboard Table */}
        <div
          className={clsx(
            'rounded-2xl border-2 p-4',
            currentTypeConfig.borderColor,
            currentTypeConfig.bgColor
          )}
        >
          <Row className="mb-4 items-center gap-2">
            {(() => {
              const Icon = currentTypeConfig.icon
              return <Icon className={clsx('h-5 w-5', currentTypeConfig.color)} />
            })()}
            <span className={clsx('font-semibold', currentTypeConfig.color)}>
              Top 50 by {currentTypeConfig.name}
            </span>
          </Row>

          {loading ? (
            <LoadingLeaderboard columns={columns} />
          ) : entries ? (
            <Leaderboard
              entries={buildArray(entries, myEntry)}
              columns={columns}
              highlightUserId={user?.id}
            />
          ) : error ? (
            <div className="text-error flex h-32 w-full flex-col items-center justify-center gap-2 text-center">
              <span>Error loading leaderboard</span>
              <span className="text-sm">{error.message}</span>
              <Button onClick={refresh}>Try again</Button>
            </div>
          ) : null}
        </div>
      </Col>
    </Page>
  )
}
