import { Col } from 'web/components/layout/col'
import {
  Leaderboard,
  LoadingLeaderboard,
  type LeaderboardColumn,
  type LeaderboardEntry,
} from 'web/components/leaderboard'
import { Page } from 'web/components/layout/page'
import { formatMoney, formatWithCommas } from 'common/util/format'
import { useEffect, useState } from 'react'
import { Title } from 'web/components/widgets/title'
import { SEO } from 'web/components/SEO'
import { BETTORS } from 'common/user'
import { useUser } from 'web/hooks/use-user'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { getUserReferralsInfo } from 'common/supabase/referrals'
import { db } from 'web/lib/supabase/db'
import { getCreatorRank, getProfitRank } from 'web/lib/supabase/users'
import { type LiteGroup, TOPIC_KEY } from 'common/group'
import { Row } from 'web/components/layout/row'
import { TopicPillSelector } from 'web/components/topics/topic-selector'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { DropdownPill } from 'web/components/search/filter-pills'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'
import { useTopicFromRouter } from 'web/hooks/use-topic-from-router'
import { BackButton } from 'web/components/contract/back-button'
import { SweepsToggle } from 'web/components/sweeps/sweeps-toggle'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useSweepstakes } from 'web/components/sweepstakes-provider'
import { Button } from 'web/components/buttons/button'
import { buildArray } from 'common/util/array'
import { getCurrentPortfolio } from 'common/supabase/portfolio-metrics'
import { Banner } from 'web/components/nav/banner'

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
          p.balance + p.spiceBalance + p.investmentValue - p.totalDeposits
        cashProfit = p.cashBalance + p.cashInvestmentValue - p.totalCashDeposits
      }

      const { count: numUsers } = await db
        .from('users')
        .select('*', { count: 'exact' })

      // TODO: my ranks are inaccurate for cash stats
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

  const { prefersPlay } = useSweepstakes()
  const token = prefersPlay ? 'MANA' : 'CASH'

  const {
    data: entries,
    error,
    refresh,
  } = useAPIGetter('leaderboard', {
    kind: type,
    groupId: topic?.id,
    token,
    limit: 50,
  })

  const shouldInsertMe =
    user && entries && !entries.find((e) => e.userId === user.id) && !topic
  const data = myScores?.[type]?.[token === 'CASH' ? 'cash' : 'mana']
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
    <Page trackPageView={'leaderboards'} className="!mt-0">
      <SEO
        title="Leaderboards"
        description={`Manifold's leaderboards show the top ${BETTORS}, question creators, and referrers.`}
        url="/leaderboards"
      />
      <Banner
        className="border-primary-300 from-primary-100 to-primary-200 my-2 border bg-gradient-to-b py-2"
        link="https://manifoldmarkets.notion.site/Election-Season-Tournament-12654492ea7a805289bfca70d3dce0bd"
      >
        🗳️ Join our Election Season Tournament! Predict election outcomes and
        win prizes. Learn more
      </Banner>
      <Col className="mx-4 mb-10 w-full items-stretch self-center p-2 sm:mx-0 sm:w-[36rem]">
        <Col className={'mb-4 w-full gap-2 self-start'}>
          <Row className={'items-center gap-2'}>
            <BackButton className={'md:hidden'} />
            <Title className={'!mb-0'}>Leaderboard</Title>
          </Row>
          <div className="flex flex-wrap gap-2">
            <SweepsToggle sweepsEnabled isSmall />
            <TypePillSelector type={type} setType={setType} />
            {type != 'referral' && (
              <>
                <TopicPillSelector topic={topic} setTopic={setTopic} />
              </>
            )}
          </div>
        </Col>
        {entries ? (
          <Leaderboard
            entries={buildArray(entries, myEntry)}
            columns={columns}
            highlightUserId={user?.id}
          />
        ) : error ? (
          <div className="text-error h-10 w-full text-center">
            <div>
              Error loading leaderboard
              <div />
              <div>{error.message}</div>
              <Button onClick={refresh}>Try again</Button>
            </div>
          </div>
        ) : (
          <LoadingLeaderboard columns={columns} />
        )}
      </Col>
    </Page>
  )
}

const LEADERBOARD_TYPES = [
  {
    name: 'Profit',
    value: 'profit',
  },
  {
    name: 'Loss',
    value: 'loss',
  },
  {
    name: 'Volume',
    value: 'volume',
  },
  {
    name: 'Top creators',
    value: 'creator',
  },
  {
    name: 'Most referrals',
    value: 'referral',
  },
] as const

type LeaderboardType = (typeof LEADERBOARD_TYPES)[number]['value']

type Entry = LeaderboardEntry & { totalReferredProfit?: number }
type MyEntry = Omit<Entry, 'userId'>
type MyScores = {
  [key in LeaderboardType]?: { mana: MyEntry; cash: MyEntry }
}

const TypePillSelector = (props: {
  type: LeaderboardType
  setType: (type: LeaderboardType) => void
}) => {
  const { type, setType } = props
  const currentEntry = LEADERBOARD_TYPES.find((t) => t.value === type)!
  return (
    <DropdownMenu
      closeOnClick
      selectedItemName={currentEntry.name}
      items={LEADERBOARD_TYPES.map((t) => ({
        name: t.name,
        onClick: () => setType(t.value),
      }))}
      buttonContent={(open) => (
        <DropdownPill open={open}>{currentEntry.name}</DropdownPill>
      )}
    />
  )
}
