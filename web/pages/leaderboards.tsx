import { Col } from 'web/components/layout/col'
import {
  Leaderboard,
  LoadingLeaderboard,
  type LeaderboardColumn,
  type LeaderboardEntry,
} from 'web/components/leaderboard'
import { Page } from 'web/components/layout/page'
import { User } from 'web/lib/firebase/users'
import { formatMoney, formatWithCommas } from 'common/util/format'
import { useEffect, useState } from 'react'
import { Title } from 'web/components/widgets/title'
import { SEO } from 'web/components/SEO'
import { BETTORS } from 'common/user'
import { useUser } from 'web/hooks/use-user'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import {
  getTopReferrals,
  getUserReferralsInfo,
} from 'common/supabase/referrals'
import { db } from 'web/lib/supabase/db'
import {
  getCreatorRank,
  getDisplayUsers,
  getProfitRank,
  getTopCreators,
  getTopTraders,
} from 'web/lib/supabase/users'
import { type LiteGroup, TOPIC_KEY } from 'common/group'
import { Row } from 'web/components/layout/row'
import { TopicPillSelector } from 'web/components/topics/topic-selector'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { DropdownPill } from 'web/components/search/filter-pills'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'
import { useTopicFromRouter } from 'web/hooks/use-topic-from-router'
import { BackButton } from 'web/components/contract/back-button'
import { filterDefined } from 'common/util/array'
import { HIDE_FROM_LEADERBOARD_USER_IDS } from 'common/envs/constants'
import { useCurrentPortfolio } from 'web/hooks/use-portfolio-history'
import { TwombaToggle } from 'web/components/twomba/twomba-toggle'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useSweepstakes } from 'web/components/sweepstakes-provider'
import { Button } from 'web/components/buttons/button'

export async function getStaticProps() {
  const allTime = await queryLeaderboardUsers().catch(() => ({
    topTraders: [],
    topCreators: [],
  }))

  const topReferrals = await getTopReferrals(db).catch(() => [])

  return {
    props: {
      allTime,
      topReferrals,
    },
    revalidate: 60 * 15, // regenerate after 15 minutes
  }
}

const queryLeaderboardUsers = async () => {
  const [topTraders, topCreators] = await Promise.all([
    getTopTraders().then((users) =>
      users
        .filter((u) => !HIDE_FROM_LEADERBOARD_USER_IDS.includes(u.user_id))
        .slice(0, 20)
    ),
    getTopCreators(),
  ])
  return {
    topTraders,
    topCreators,
  }
}

type Leaderboard = Awaited<ReturnType<typeof queryLeaderboardUsers>>
type ReferralLeaderboard = Awaited<ReturnType<typeof getTopReferrals>>

type Ranking = {
  profitRank: number
  tradersRank: number
  referralsRank: number
}

export default function Leaderboards(props: {
  allTime: Leaderboard
  topReferrals: ReferralLeaderboard
}) {
  const [myRanks, setMyRanks] = useState<Ranking>()
  const [userReferralInfo, setUserReferralInfo] =
    useState<Awaited<ReturnType<typeof getUserReferralsInfo>>>()
  const user = useUser()
  const currentHistory = useCurrentPortfolio(user?.id)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const rankings = {} as Ranking
      rankings.profitRank = await getProfitRank(user.id)
      rankings.tradersRank = await getCreatorRank(user.id)

      const referrerInfo = await getUserReferralsInfo(user.id, db)
      setUserReferralInfo(referrerInfo)
      rankings.referralsRank = referrerInfo.rank

      setMyRanks(rankings)
    })()
  }, [user?.id])

  const [topicSlug, setTopicSlug] = usePersistentQueryState(TOPIC_KEY, '')
  const topicFromRouter = useTopicFromRouter(topicSlug)
  const [topic, setTopic] = useState<LiteGroup | undefined>()
  const [type, setType] = useState<LeaderboardType>('profit')

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
    groupId: type === 'referral' ? undefined : topic?.id,
    token,
    limit: 50,
  })

  // if (user && currentHistory && myRanks != null && !topic) {
  //   if (
  //     myRanks.profitRank != null &&
  //     !topTraderEntries.find((x) => x.id === user.id)
  //   ) {
  //     topTraderEntries.push({
  //       ...user,
  //       score: currentHistory.profit ?? user.profitCached.allTime,
  //       rank: myRanks.profitRank,
  //     })
  //   }
  //   if (
  //     myRanks.tradersRank != null &&
  //     !topCreatorEntries.find((x) => x.id === user.id)
  //   ) {
  //     topCreatorEntries.push({
  //       ...user,
  //       score: user.creatorTraders.allTime,
  //       rank: myRanks.tradersRank,
  //     })
  //   }
  //   // Currently only set for allTime
  //   if (
  //     myRanks.referralsRank != null &&
  //     !topReferrals.find((x) => x.id === user.id)
  //   ) {
  //     topReferrals.push({
  //       ...user,
  //       rank: myRanks.referralsRank,
  //       totalReferrals: userReferralInfo?.total_referrals ?? 0,
  //       totalReferredProfit: userReferralInfo?.total_referred_profit ?? 0,
  //     })
  //   }
  // }

  const allColumns: { [key in LeaderboardType]: LeaderboardColumn[] } = {
    profit: [
      {
        header: 'Profit',
        renderCell: (user: any) => formatMoney(user.score, token),
      },
    ],

    creator: [
      {
        header: 'Traders',
        renderCell: (user: any) => formatWithCommas(user.score),
      },
    ],

    referral: [
      {
        header: 'Referrals',
        renderCell: (user: any) => user.score,
      },
      {
        header: (
          <span>
            Referred profits
            <InfoTooltip text={'Total profit earned by referred users'} />
          </span>
        ),
        renderCell: (user: any) => formatMoney(user.totalReferredProfit ?? 0),
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
      <Col className="mx-4 mb-10 items-center self-center p-2 md:mx-0 md:w-[35rem]">
        <Row
          className={'mb-4 w-full flex-wrap items-center justify-between gap-2'}
        >
          <Row className={'items-center gap-2'}>
            <BackButton className={'md:hidden'} />
            <Title className={'!mb-0'}>Leaderboard</Title>
          </Row>
          <div className="flex gap-2">
            <TypePillSelector type={type} setType={setType} />
            {type != 'referral' && (
              <TopicPillSelector topic={topic} setTopic={setTopic} />
            )}
            <TwombaToggle sweepsEnabled isSmall />
          </div>
        </Row>
        {entries ? (
          <Leaderboard
            entries={entries}
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
    name: 'Top traders',
    value: 'profit',
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
