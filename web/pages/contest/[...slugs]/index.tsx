import { debounce, sortBy, take } from 'lodash'
import PlusSmIcon from '@heroicons/react/solid/PlusSmIcon'

import { Group, GROUP_CHAT_SLUG } from 'common/group'
import { Page } from 'web/components/page'
import { listAllBets } from 'web/lib/firebase/bets'
import { Contract, listContractsByGroupSlug } from 'web/lib/firebase/contracts'
import {
  addContractToGroup,
  getGroupBySlug,
  groupPath,
  joinGroup,
  updateGroup,
} from 'web/lib/firebase/groups'
import { Row } from 'web/components/layout/row'
import { UserLink } from 'web/components/user-page'
import { firebaseLogin, getUser, User } from 'web/lib/firebase/users'
import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'
import { listMembers, useGroup, useMembers } from 'web/hooks/use-group'
import { useRouter } from 'next/router'
import { scoreCreators, scoreTraders } from 'common/scoring'
import { Leaderboard } from 'web/components/leaderboard'
import { formatMoney } from 'common/util/format'
import { EditGroupButton } from 'web/components/groups/edit-group-button'
import Custom404 from '../../404'
import { SEO } from 'web/components/SEO'
import { Linkify } from 'web/components/linkify'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { Tabs } from 'web/components/layout/tabs'
import { CreateQuestionButton } from 'web/components/create-question-button'
import React, { useState } from 'react'
import { GroupChat } from 'web/components/groups/group-chat'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { Modal } from 'web/components/layout/modal'
import { getSavedSort } from 'web/hooks/use-sort-and-query-params'
import { ChoicesToggleGroup } from 'web/components/choices-toggle-group'
import { toast } from 'react-hot-toast'
import { useCommentsOnGroup } from 'web/hooks/use-comments'
import { REFERRAL_AMOUNT } from 'common/user'
import { ContractSearch } from 'web/components/contract-search'
import clsx from 'clsx'
import { FollowList } from 'web/components/follow-list'
import { SearchIcon } from '@heroicons/react/outline'
import { useTipTxns } from 'web/hooks/use-tip-txns'
import { JoinOrLeaveGroupButton } from 'web/components/groups/groups-button'
import { searchInAny } from 'common/util/parse'
import { useWindowSize } from 'web/hooks/use-window-size'
import { CopyLinkButton } from 'web/components/copy-link-button'
import { ENV_CONFIG } from 'common/envs/constants'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { Button } from 'web/components/button'
import { SubmissionSearch } from 'web/components/submission-search'
import { ContestChat } from 'web/components/contests/contest-chat'
import { contestPath } from 'web/lib/firebase/contests'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const contest = await getGroupBySlug(slugs[0])
  const members = contest && (await listMembers(contest))
  const creatorPromise = contest ? getUser(contest.creatorId) : null

  const contracts =
    (contest && (await listContractsByGroupSlug(contest.slug))) ?? []

  const bets = await Promise.all(
    contracts.map((contract: Contract) => listAllBets(contract.id))
  )

  const creatorScores = scoreCreators(contracts)
  const traderScores = scoreTraders(contracts, bets)
  const [topCreators, topTraders] =
    (members && [
      toTopUsers(creatorScores, members),
      toTopUsers(traderScores, members),
    ]) ??
    []

  const creator = await creatorPromise

  return {
    props: {
      contest,
      members,
      creator,
      traderScores,
      topTraders,
      creatorScores,
      topCreators,
    },

    revalidate: 60, // regenerate after a minute
  }
}

function toTopUsers(userScores: { [userId: string]: number }, users: User[]) {
  const topUserPairs = take(
    sortBy(Object.entries(userScores), ([_, score]) => -1 * score),
    10
  ).filter(([_, score]) => score >= 0.5)

  const topUsers = topUserPairs.map(
    ([userId]) => users.filter((user) => user.id === userId)[0]
  )
  return topUsers.filter((user) => user)
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}
const contestSubpages = [
  undefined,
  GROUP_CHAT_SLUG,
  'submissions',
  'leaderboards',
  'about',
] as const

export default function ContestPage(props: {
  contest: Group | null
  members: User[]
  creator: User
  traderScores: { [userId: string]: number }
  topTraders: User[]
  creatorScores: { [userId: string]: number }
  topCreators: User[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    contest: null,
    members: [],
    creator: null,
    traderScores: {},
    topTraders: [],
    creatorScores: {},
    topCreators: [],
  }
  const {
    creator,
    members,
    traderScores,
    topTraders,
    creatorScores,
    topCreators,
  } = props

  const router = useRouter()
  const { slugs } = router.query as { slugs: string[] }
  const page = slugs?.[1] as typeof contestSubpages[number]

  const contest = useGroup(props.contest?.id) ?? props.contest
  const tips = useTipTxns({ groupId: contest?.id })

  const messages = useCommentsOnGroup(contest?.id)

  const user = useUser()

  useSaveReferral(user, {
    defaultReferrer: creator.username,
    groupId: contest?.id,
  })

  const { width } = useWindowSize()
  const chatDisabled = !contest || contest.chatDisabled
  const showChatSidebar = !chatDisabled && (width ?? 1280) >= 1280
  const showChatTab = !chatDisabled && !showChatSidebar

  if (contest === null || !contestSubpages.includes(page) || slugs[2]) {
    return <Custom404 />
  }
  const { memberIds } = contest
  const isCreator = user && contest && user.id === contest.creatorId
  const isMember = user && memberIds.includes(user.id)

  const leaderboard = (
    <Col>
      <ContestLeaderboards
        traderScores={traderScores}
        creatorScores={creatorScores}
        topTraders={topTraders}
        topCreators={topCreators}
        members={members}
        user={user}
      />
    </Col>
  )

  const aboutTab = (
    <Col>
      <ContestOverview contest={contest} />
    </Col>
  )

  const chatTab = (
    <Col className="">
      {messages ? (
        <ContestChat
          messages={messages}
          user={user}
          contest={contest}
          tips={tips}
        />
      ) : (
        <LoadingIndicator />
      )}
    </Col>
  )

  const submissionsTab = (
    <SubmissionSearch
      querySortOptions={{
        shouldLoadFromStorage: true,
        defaultSort: getSavedSort() ?? 'newest',
        defaultFilter: 'open',
      }}
      additionalFilter={{ contestSlug: contest.slug }}
    />
  )

  const tabs = [
    ...(!showChatTab
      ? []
      : [
          {
            title: 'Chat',
            content: chatTab,
            href: contestPath(contest.slug, GROUP_CHAT_SLUG),
          },
        ]),
    {
      title: 'Submissions',
      content: submissionsTab,
      href: contestPath(contest.slug, 'submissions'),
    },
    {
      title: 'Leaderboards',
      content: leaderboard,
      href: contestPath(contest.slug, 'leaderboards'),
    },
    {
      title: 'About',
      content: aboutTab,
      href: contestPath(contest.slug, 'about'),
    },
  ]

  const tabIndex = tabs.map((t) => t.title).indexOf(page ?? GROUP_CHAT_SLUG)

  return (
    <Page
      rightSidebar={showChatSidebar ? chatTab : undefined}
      rightSidebarClassName={showChatSidebar ? '!top-0' : ''}
      className={showChatSidebar ? '!max-w-7xl !pb-0' : ''}
    >
      <SEO
        title={contest.name}
        description={`Created by ${creator.name}. ${contest.about}`}
        url={contestPath(contest.slug)}
      />
      <Col className="px-3">
        <Row className={'items-center justify-between gap-4'}>
          <div className={'sm:mb-1'}>
            <div
              className={'line-clamp-1 my-2 text-2xl text-indigo-700 sm:my-3'}
            >
              {contest.name}
            </div>
            <div className={'hidden sm:block'}>
              <Linkify text={contest.about} />
            </div>
          </div>
        </Row>
      </Col>
      <Tabs
        currentPageForAnalytics={contestPath(contest.slug)}
        className={'mb-0 sm:mb-2'}
        defaultIndex={tabIndex > 0 ? tabIndex : 0}
        tabs={tabs}
      />
    </Page>
  )
}

function ContestOverview(props: { contest: Group }) {
  const { contest } = props

  return (
    <>
      <Col className="gap-2 rounded-b bg-white p-2">
        <div className={'block sm:hidden'}>
          <Linkify text={contest.about} />
        </div>
      </Col>
    </>
  )
}

function SortedLeaderboard(props: {
  users: User[]
  scoreFunction: (user: User) => number
  title: string
  header: string
  maxToShow?: number
}) {
  const { users, scoreFunction, title, header, maxToShow } = props
  const sortedUsers = users.sort((a, b) => scoreFunction(b) - scoreFunction(a))
  return (
    <Leaderboard
      className="max-w-xl"
      users={sortedUsers}
      title={title}
      columns={[
        { header, renderCell: (user) => formatMoney(scoreFunction(user)) },
      ]}
      maxToShow={maxToShow}
    />
  )
}

function ContestLeaderboards(props: {
  traderScores: { [userId: string]: number }
  creatorScores: { [userId: string]: number }
  topTraders: User[]
  topCreators: User[]
  members: User[]
  user: User | null | undefined
}) {
  const { traderScores, creatorScores, members, topTraders, topCreators } =
    props
  const maxToShow = 50
  // Consider hiding M$0
  // If it's just one member (curator), show all bettors, otherwise just show members
  return (
    <Col>
      <div className="mt-4 flex flex-col gap-8 px-4 md:flex-row">
        {members.length > 1 ? (
          <>
            <SortedLeaderboard
              users={members}
              scoreFunction={(user) => traderScores[user.id] ?? 0}
              title="🏅 Top traders"
              header="Profit"
              maxToShow={maxToShow}
            />
            <SortedLeaderboard
              users={members}
              scoreFunction={(user) => creatorScores[user.id] ?? 0}
              title="🏅 Top creators"
              header="Market volume"
              maxToShow={maxToShow}
            />
          </>
        ) : (
          <>
            <Leaderboard
              className="max-w-xl"
              title="🏅 Top traders"
              users={topTraders}
              columns={[
                {
                  header: 'Profit',
                  renderCell: (user) => formatMoney(traderScores[user.id] ?? 0),
                },
              ]}
              maxToShow={maxToShow}
            />
            <Leaderboard
              className="max-w-xl"
              title="🏅 Top creators"
              users={topCreators}
              columns={[
                {
                  header: 'Market volume',
                  renderCell: (user) =>
                    formatMoney(creatorScores[user.id] ?? 0),
                },
              ]}
              maxToShow={maxToShow}
            />
          </>
        )}
      </div>
    </Col>
  )
}
