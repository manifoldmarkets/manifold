import { Col } from 'web/components/layout/col'
import { Leaderboard } from 'web/components/leaderboard'
import { zip } from 'lodash'
import { Page } from 'web/components/layout/page'
import { Period, User } from 'web/lib/firebase/users'
import { formatMoney, formatWithCommas } from 'common/util/format'
import { useEffect, useState } from 'react'
import { Title } from 'web/components/widgets/title'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { useTracking } from 'web/hooks/use-tracking'
import { SEO } from 'web/components/SEO'
import { BETTORS } from 'common/user'
import { useUser } from 'web/hooks/use-user'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import {
  getUserReferralsInfo,
  getTopReferrals,
} from 'common/supabase/referrals'
import { db } from 'web/lib/supabase/db'
import {
  getTopTraders,
  getTopCreators,
  getProfitRank,
  getCreatorRank,
} from 'web/lib/supabase/users'

export async function getStaticProps() {
  const [allTime, monthly, weekly, daily] = await Promise.all([
    queryLeaderboardUsers('allTime'),
    queryLeaderboardUsers('monthly'),
    queryLeaderboardUsers('weekly'),
    queryLeaderboardUsers('daily'),
  ])

  const topReferrals = await getTopReferrals(db)
  return {
    props: {
      allTime,
      monthly,
      weekly,
      daily,
      topReferrals,
    },
    revalidate: 60 * 15, // regenerate after 15 minutes
  }
}

const queryLeaderboardUsers = async (period: Period) => {
  const [topTraders, topCreators] = await Promise.all([
    getTopTraders(period),
    getTopCreators(period),
  ])
  return {
    topTraders,
    topCreators,
  }
}

type leaderboard = {
  topTraders: User[]
  topCreators: User[]
}
type ranking = {
  profitRank: number
  tradersRank: number
  referralsRank: number
}
export default function Leaderboards(props: {
  allTime: leaderboard
  monthly: leaderboard
  weekly: leaderboard
  daily: leaderboard
  topReferrals: Awaited<ReturnType<typeof getTopReferrals>>
}) {
  const [myRanks, setMyRanks] = useState<
    Record<Period, ranking | undefined> | undefined
  >()
  const [userReferralInfo, setUserReferralInfo] =
    useState<Awaited<ReturnType<typeof getUserReferralsInfo>>>()

  const user = useUser()

  useEffect(() => {
    if (!user?.profitCached) return

    const periods = ['allTime', 'monthly', 'weekly', 'daily'] as const
    Promise.all(
      periods.map(async (period) => {
        const rankings = {} as ranking
        const myProfit = user.profitCached?.[period]
        if (myProfit != null) {
          rankings.profitRank = await getProfitRank(myProfit, period)
        }
        const myTraders = user.creatorTraders?.[period]
        if (myTraders != null) {
          rankings.tradersRank = await getCreatorRank(myTraders, period)
        }
        if (period === 'allTime') {
          const referrerInfo = await getUserReferralsInfo(user.id, db)
          setUserReferralInfo(referrerInfo)
          rankings.referralsRank = referrerInfo.rank
        }
        return rankings
      })
    ).then((results) => {
      setMyRanks(Object.fromEntries(zip(periods, results)))
    })
  }, [user?.creatorTraders, user?.profitCached])

  const { topReferrals } = props

  const LeaderboardWithPeriod = (period: Period, myRankForPeriod?: ranking) => {
    const { topTraders, topCreators } = props[period]

    const user = useUser()
    const topTraderEntries = topTraders.map((user, i) => ({
      ...user,
      rank: i + 1,
    }))
    const topCreatorEntries = topCreators.map((user, i) => ({
      ...user,
      rank: i + 1,
    }))
    if (user && myRankForPeriod != null) {
      if (
        myRankForPeriod.profitRank != null &&
        !topTraderEntries.find((x) => x.id === user.id)
      ) {
        topTraderEntries.push({ ...user, rank: myRankForPeriod.profitRank })
      }
      if (
        myRankForPeriod.tradersRank != null &&
        !topCreatorEntries.find((x) => x.id === user.id)
      ) {
        topCreatorEntries.push({ ...user, rank: myRankForPeriod.tradersRank })
      }
      // Currently only set for allTime
      if (
        myRankForPeriod.referralsRank != null &&
        !topReferrals.find((x) => x.id === user.id)
      ) {
        topReferrals.push({
          ...user,
          rank: myRankForPeriod.referralsRank,
          totalReferrals: userReferralInfo?.total_referrals ?? 0,
          totalReferredProfit: userReferralInfo?.total_referred_profit ?? 0,
        })
      }
    }

    return (
      <>
        <Col className="items-center gap-10 lg:flex-row lg:items-start">
          <Leaderboard
            title={`🏅 Top ${BETTORS}`}
            entries={topTraderEntries}
            columns={[
              {
                header: 'Profit',
                renderCell: (user) => formatMoney(user.profitCached[period]),
              },
            ]}
            highlightUsername={user?.username}
          />

          <Leaderboard
            title="🏅 Top creators"
            entries={topCreatorEntries}
            columns={[
              {
                header: 'Traders',
                renderCell: (user) =>
                  formatWithCommas(user.creatorTraders[period]),
              },
            ]}
            highlightUsername={user?.username}
          />
        </Col>
        {period === 'allTime' ? (
          <Col className="mx-4 my-10 items-center gap-10 lg:mx-0 lg:w-[35rem] lg:flex-row">
            <Leaderboard
              title="🏅 Top Referrers"
              entries={topReferrals}
              columns={[
                {
                  header: 'Referrals',
                  renderCell: (user) => user.totalReferrals,
                },
                {
                  header: (
                    <span>
                      Referred profits
                      <InfoTooltip
                        text={'Total profit earned by referred users'}
                      />
                    </span>
                  ),
                  renderCell: (user) =>
                    formatMoney(user.totalReferredProfit ?? 0),
                },
              ]}
              highlightUsername={user?.username}
            />
          </Col>
        ) : (
          <></>
        )}
      </>
    )
  }
  useTracking('view leaderboards')

  return (
    <Page>
      <SEO
        title="Leaderboards"
        description={`Manifold's leaderboards show the top ${BETTORS}, market creators, and referrers.`}
        url="/leaderboards"
      />
      <Col className="mb-4 p-2">
        <Title className={'hidden md:block'}>
          Leaderboards <InfoTooltip text="Updated every 15 minutes" />
        </Title>

        <QueryUncontrolledTabs
          className="mb-4"
          currentPageForAnalytics={'leaderboards'}
          defaultIndex={3}
          tabs={[
            {
              title: 'Daily',
              content: LeaderboardWithPeriod('daily', myRanks?.['daily']),
            },
            {
              title: 'Weekly',
              content: LeaderboardWithPeriod('weekly', myRanks?.['weekly']),
            },
            {
              title: 'Monthly',
              content: LeaderboardWithPeriod('monthly', myRanks?.['monthly']),
            },
            {
              title: 'All Time',
              content: LeaderboardWithPeriod('allTime', myRanks?.['allTime']),
            },
          ]}
        />
      </Col>
    </Page>
  )
}
