import { Col } from 'web/components/layout/col'
import { Leaderboard } from 'web/components/leaderboard'
import { Page } from 'web/components/layout/page'
import { Period, User } from 'web/lib/firebase/users'
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
  getProfitRank,
  getTopCreators,
  getTopTraders,
} from 'web/lib/supabase/users'
import { Group } from 'common/group'
import { getUsers } from 'web/lib/supabase/user'
import { Row } from 'web/components/layout/row'
import { GroupSelector } from 'web/components/groups/group-selector'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { Modal } from 'web/components/layout/modal'
import { TagIcon, XIcon } from '@heroicons/react/outline'
import { DotsVerticalIcon } from '@heroicons/react/solid'

export async function getStaticProps() {
  const allTime = await queryLeaderboardUsers('allTime')

  const topReferrals = await getTopReferrals(db)
  return {
    props: {
      allTime,
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

type Leaderboard = {
  topTraders: User[]
  topCreators: User[]
}
type Ranking = {
  profitRank: number
  tradersRank: number
  referralsRank: number
}
export default function Leaderboards(props: {
  allTime: Leaderboard
  topReferrals: Awaited<ReturnType<typeof getTopReferrals>>
}) {
  const [myRanks, setMyRanks] = useState<Ranking>()
  const [userReferralInfo, setUserReferralInfo] =
    useState<Awaited<ReturnType<typeof getUserReferralsInfo>>>()
  const [showSelectGroupModal, setShowSelectGroupModal] = useState(false)
  const user = useUser()

  useEffect(() => {
    if (!user?.profitCached) return
    ;(async () => {
      const rankings = {} as Ranking
      const myProfit = user.profitCached?.allTime
      if (myProfit != null) {
        rankings.profitRank = await getProfitRank(myProfit, 'allTime')
      }
      const myTraders = user.creatorTraders?.allTime
      if (myTraders != null) {
        rankings.tradersRank = await getCreatorRank(myTraders, 'allTime')
      }
      const referrerInfo = await getUserReferralsInfo(user.id, db)
      setUserReferralInfo(referrerInfo)
      rankings.referralsRank = referrerInfo.rank

      setMyRanks(rankings)
    })()
  }, [user?.creatorTraders, user?.profitCached])

  const { topReferrals } = props
  const [topic, setTopic] = useState<Group>()
  const topTopicTraders = useToTopUsers(
    topic && topic.cachedLeaderboard?.topTraders
  )?.map((c) => ({
    ...c.user,
    profitCached: {
      allTime: c.score,
    },
  }))

  const topTopicCreators = useToTopUsers(
    topic && topic.cachedLeaderboard?.topCreators
  )?.map((c) => ({
    ...c.user,
    creatorTraders: {
      allTime: c.score,
    },
  }))

  const { topTraders, topCreators } = props.allTime

  const topTraderEntries = (
    topic && topTopicTraders ? topTopicTraders : topTraders
  ).map((user, i) => ({
    ...user,
    rank: i + 1,
  }))
  const topCreatorEntries = (
    topic && topTopicCreators ? topTopicCreators : topCreators
  ).map((user, i) => ({
    ...user,
    rank: i + 1,
  }))

  if (user && myRanks != null && !topic) {
    if (
      myRanks.profitRank != null &&
      !topTraderEntries.find((x) => x.id === user.id)
    ) {
      topTraderEntries.push({ ...user, rank: myRanks.profitRank })
    }
    if (
      myRanks.tradersRank != null &&
      !topCreatorEntries.find((x) => x.id === user.id)
    ) {
      topCreatorEntries.push({ ...user, rank: myRanks.tradersRank })
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

  return (
    <Page trackPageView={'leaderboards'}>
      <SEO
        title="Leaderboards"
        description={`Manifold's leaderboards show the top ${BETTORS}, question creators, and referrers.`}
        url="/leaderboards"
      />
      <Col className="mb-4 p-2">
        <Row className={'mb-4 items-center justify-between'}>
          <Title className={'!mb-0'}>
            Leaderboards <InfoTooltip text="Updated every 15 minutes" />
          </Title>
          <DropdownMenu
            Icon={<DotsVerticalIcon className={'h-5 w-5'} />}
            menuWidth={'w-48'}
            Items={[
              {
                name: 'Filter by topic',
                onClick: () => setShowSelectGroupModal(true),
                icon: (
                  <TagIcon
                    className="text-ink-400 h-5 w-5"
                    aria-hidden="true"
                  />
                ),
              },
            ]}
          />
        </Row>

        <Col className="items-center gap-10 lg:flex-row lg:items-start">
          <Leaderboard
            title={`🏅 ${topic?.name ?? 'Top'} ${BETTORS}`}
            entries={topTraderEntries}
            columns={[
              {
                header: 'Profit',
                renderCell: (user) => formatMoney(user.profitCached.allTime),
              },
            ]}
            highlightUsername={user?.username}
          />

          <Leaderboard
            title={`🏅 ${topic?.name ?? 'Top'} creators`}
            entries={topCreatorEntries}
            columns={[
              {
                header: 'Traders',
                renderCell: (user) =>
                  formatWithCommas(user.creatorTraders.allTime),
              },
            ]}
            highlightUsername={user?.username}
          />
        </Col>
        {!topic && (
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
        )}
      </Col>
      <SelectTopicModal
        open={showSelectGroupModal}
        setOpen={setShowSelectGroupModal}
        setGroup={setTopic}
        group={topic}
      />
    </Page>
  )
}

const SelectTopicModal = (props: {
  open: boolean
  setOpen: (open: boolean) => void
  group?: Group
  setGroup: (group: Group | undefined) => void
}) => {
  const { open, group, setOpen, setGroup } = props
  return (
    <Modal open={open} setOpen={setOpen} size={'lg'}>
      <Col className={'bg-canvas-50 min-h-[25rem] rounded-xl p-4'}>
        <Title className={''}>Filter leaderboards by topic</Title>
        {group && (
          <Row className={'items-center justify-between gap-2'}>
            <span className={'text-ink-900 text-lg font-bold'}>
              {group.name}
            </span>
            <button
              onClick={() => {
                setGroup(undefined)
              }}
            >
              <XIcon className="hover:text-ink-700 text-ink-400 ml-1 h-4 w-4" />
            </button>
          </Row>
        )}
        <Col className={''}>
          <GroupSelector
            setSelectedGroup={(group) => {
              setGroup(group)
              setOpen(false)
            }}
          />
        </Col>
      </Col>
    </Modal>
  )
}

const toTopUsers = async (
  cachedUserIds: { userId: string; score: number }[]
): Promise<{ user: User | null; score: number }[]> => {
  const userData = await getUsers(cachedUserIds.map((u) => u.userId))
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
