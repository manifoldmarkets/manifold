import { Col } from 'web/components/layout/col'
import { Leaderboard, type LeaderboardEntry } from 'web/components/leaderboard'
import { Page } from 'web/components/layout/page'
import { User } from 'web/lib/firebase/users'
import { formatMoney, formatWithCommas } from 'common/util/format'
import { ReactNode, useEffect, useState } from 'react'
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
import { type Group, type LiteGroup, TOPIC_KEY } from 'common/group'
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
    if (!user?.profitCached) return
    ;(async () => {
      const rankings = {} as Ranking
      rankings.profitRank = await getProfitRank(user.id)
      rankings.tradersRank = await getCreatorRank(user.id)

      const referrerInfo = await getUserReferralsInfo(user.id, db)
      setUserReferralInfo(referrerInfo)
      rankings.referralsRank = referrerInfo.rank

      setMyRanks(rankings)
    })()
  }, [user?.creatorTraders, user?.profitCached])

  const { topReferrals } = props

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

  const topTopicTraders = useToTopUsers(
    topic && (topic as Group).cachedLeaderboard?.topTraders
  )?.map((c) => ({
    ...c.user,
    profitCached: {
      allTime: c.score,
    },
  }))

  const topTopicCreators = useToTopUsers(
    topic && (topic as Group).cachedLeaderboard?.topCreators
  )?.map((c) => ({
    ...c.user,
    creatorTraders: {
      allTime: c.score,
    },
  }))

  const { topTraders, topCreators } = props.allTime

  const topTraderEntries = (
    topic && topTopicTraders
      ? topTopicTraders.map((u) => ({
          ...u,
          score: u.profitCached.allTime,
        }))
      : topTraders.map((u) => ({
          name: u.name,
          username: u.username,
          avatarUrl: u.avatar_url,
          score: u.profit,
          id: u.user_id,
        }))
  ).map((user, i) => ({
    ...user,
    rank: i + 1,
  }))
  const topCreatorEntries = (
    topic && topTopicCreators
      ? topTopicCreators.map((u) => ({
          ...u,
          score: u.creatorTraders.allTime,
        }))
      : topCreators.map((u) => ({
          name: u.name,
          username: u.username,
          avatarUrl: u.avatar_url,
          score: u.total_traders,
          id: u.user_id,
        }))
  ).map((user, i) => ({
    ...user,
    rank: i + 1,
  }))

  if (user && currentHistory && myRanks != null && !topic) {
    if (
      myRanks.profitRank != null &&
      !topTraderEntries.find((x) => x.id === user.id)
    ) {
      topTraderEntries.push({
        ...user,
        score: currentHistory.profit ?? user.profitCached.allTime,
        rank: myRanks.profitRank,
      })
    }
    if (
      myRanks.tradersRank != null &&
      !topCreatorEntries.find((x) => x.id === user.id)
    ) {
      topCreatorEntries.push({
        ...user,
        score: user.creatorTraders.allTime,
        rank: myRanks.tradersRank,
      })
    }
    // Currently only set for allTime
    if (
      myRanks.referralsRank != null &&
      !topReferrals.find((x) => x.id === user.id)
    ) {
      topReferrals.push({
        ...user,
        rank: myRanks.referralsRank,
        totalReferrals: userReferralInfo?.total_referrals ?? 0,
        totalReferredProfit: userReferralInfo?.total_referred_profit ?? 0,
      })
    }
  }

  type LeaderboardData<T extends LeaderboardEntry = LeaderboardEntry> = {
    entries: T[]
    columns: { header: string | ReactNode; renderCell: (entry: T) => string }[]
  }

  const leaderboards: { [key in LeaderboardType]: LeaderboardData } = {
    profit: {
      entries: topTraderEntries,
      columns: [
        {
          header: 'Profit',
          renderCell: (user: any) => formatMoney(user.score),
        },
      ],
    },
    creators: {
      entries: topCreatorEntries,
      columns: [
        {
          header: 'Traders',
          renderCell: (user: any) => formatWithCommas(user.score),
        },
      ],
    },
    referrals: {
      entries: topReferrals,
      columns: [
        {
          header: 'Referrals',
          renderCell: (user: any) => user.totalReferrals,
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
    },
  }

  const { entries, columns } = leaderboards[type]

  return (
    <Page trackPageView={'leaderboards'}>
      <SEO
        title="Leaderboards"
        description={`Manifold's leaderboards show the top ${BETTORS}, question creators, and referrers.`}
        url="/leaderboards"
      />
      <Col className="mx-4 mb-10 items-center self-center p-2 md:mx-0 md:w-[35rem]">
        <Row className={'mb-4 w-full items-center justify-between'}>
          <Row className={'items-center gap-2'}>
            <BackButton className={'md:hidden'} />
            <Title className={'!mb-0'}>Leaderboard</Title>
          </Row>
          <div className="flex gap-2">
            <TypePillSelector type={type} setType={setType} />
            {type != 'referrals' && (
              <TopicPillSelector topic={topic} setTopic={setTopic} />
            )}
            <TwombaToggle sweepsEnabled isSmall />
          </div>
        </Row>

        <Leaderboard
          entries={entries}
          columns={columns}
          highlightUsername={user?.username}
        />
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
    value: 'creators',
  },
  {
    name: 'Most referrals',
    value: 'referrals',
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

const toTopUsers = async (
  cachedUserIds: { userId: string; score: number }[]
): Promise<{ user: User | null; score: number }[]> => {
  const userData = filterDefined(
    await getDisplayUsers(cachedUserIds.map((u) => u.userId))
  )
  const usersById = Object.fromEntries(userData.map((u) => [u.id, u as User]))
  return cachedUserIds
    .map((e) => ({
      user: usersById[e.userId],
      score: e.score,
    }))
    .filter((e) => e.user != null)
}

function useToTopUsers(
  cachedUserIds: { userId: string; score: number }[] | undefined
): UserStats[] | undefined {
  const [topUsers, setTopUsers] = useState<UserStats[]>()
  useEffect(() => {
    if (cachedUserIds)
      toTopUsers(cachedUserIds).then((result) =>
        setTopUsers(result as UserStats[])
      )
  }, [JSON.stringify(cachedUserIds)])
  return topUsers && topUsers.length > 0 ? topUsers : undefined
}

type UserStats = { user: User; score: number }
