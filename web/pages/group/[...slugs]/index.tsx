import { take, sortBy, debounce } from 'lodash'

import { Group, GROUP_CHAT_SLUG } from 'common/group'
import { Page } from 'web/components/page'
import { listAllBets } from 'web/lib/firebase/bets'
import { Contract, listContractsByGroupSlug } from 'web/lib/firebase/contracts'
import {
  groupPath,
  getGroupBySlug,
  updateGroup,
  joinGroup,
  addContractToGroup,
} from 'web/lib/firebase/groups'
import { Row } from 'web/components/layout/row'
import { UserLink } from 'web/components/user-page'
import {
  firebaseLogin,
  getUser,
  User,
  writeReferralInfo,
} from 'web/lib/firebase/users'
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
import {
  createButtonStyle,
  CreateQuestionButton,
} from 'web/components/create-question-button'
import React, { useEffect, useState } from 'react'
import { GroupChat } from 'web/components/groups/group-chat'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { Modal } from 'web/components/layout/modal'
import { getSavedSort } from 'web/hooks/use-sort-and-query-params'
import { ChoicesToggleGroup } from 'web/components/choices-toggle-group'
import { toast } from 'react-hot-toast'
import { useCommentsOnGroup } from 'web/hooks/use-comments'
import { ShareIconButton } from 'web/components/share-icon-button'
import { REFERRAL_AMOUNT } from 'common/user'
import { ContractSearch } from 'web/components/contract-search'
import clsx from 'clsx'
import { FollowList } from 'web/components/follow-list'
import { SearchIcon } from '@heroicons/react/outline'
import { useTipTxns } from 'web/hooks/use-tip-txns'
import { JoinOrLeaveGroupButton } from 'web/components/groups/groups-button'
import { OnlineUserList } from 'web/components/online-user-list'
import { searchInAny } from 'common/util/parse'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const group = await getGroupBySlug(slugs[0])
  const members = group && (await listMembers(group))
  const creatorPromise = group ? getUser(group.creatorId) : null

  const contracts =
    (group && (await listContractsByGroupSlug(group.slug))) ?? []

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
      group,
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
const groupSubpages = [
  undefined,
  GROUP_CHAT_SLUG,
  'questions',
  'rankings',
  'about',
] as const

export default function GroupPage(props: {
  group: Group | null
  members: User[]
  creator: User
  traderScores: { [userId: string]: number }
  topTraders: User[]
  creatorScores: { [userId: string]: number }
  topCreators: User[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    group: null,
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
  const page = slugs?.[1] as typeof groupSubpages[number]

  const group = useGroup(props.group?.id) ?? props.group
  const tips = useTipTxns({ groupId: group?.id })

  const messages = useCommentsOnGroup(group?.id)

  const user = useUser()
  useEffect(() => {
    const { referrer } = router.query as {
      referrer?: string
    }
    if (!user && router.isReady)
      writeReferralInfo(creator.username, undefined, referrer, group?.slug)
  }, [user, creator, group, router])

  if (group === null || !groupSubpages.includes(page) || slugs[2]) {
    return <Custom404 />
  }
  const { memberIds } = group
  const isCreator = user && group && user.id === group.creatorId
  const isMember = user && memberIds.includes(user.id)

  const rightSidebar = (
    <Col className="mt-6 hidden xl:block">
      <JoinOrAddQuestionsButtons
        group={group}
        user={user}
        isMember={!!isMember}
      />
      <OnlineUserList users={members} />
    </Col>
  )
  const leaderboard = (
    <Col>
      <GroupLeaderboards
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
      <GroupOverview
        group={group}
        creator={creator}
        isCreator={!!isCreator}
        user={user}
        members={members}
      />
    </Col>
  )

  const tabs = [
    ...(group.chatDisabled
      ? []
      : [
          {
            title: 'Chat',
            content: messages ? (
              <GroupChat
                messages={messages}
                user={user}
                group={group}
                tips={tips}
              />
            ) : (
              <LoadingIndicator />
            ),
            href: groupPath(group.slug, GROUP_CHAT_SLUG),
          },
        ]),
    {
      title: 'Questions',
      content: (
        <ContractSearch
          querySortOptions={{
            shouldLoadFromStorage: true,
            defaultSort: getSavedSort() ?? 'newest',
            defaultFilter: 'open',
          }}
          additionalFilter={{ groupSlug: group.slug }}
        />
      ),
      href: groupPath(group.slug, 'questions'),
    },
    {
      title: 'Rankings',
      content: leaderboard,
      href: groupPath(group.slug, 'rankings'),
    },
    {
      title: 'About',
      content: aboutTab,
      href: groupPath(group.slug, 'about'),
    },
  ]
  const tabIndex = tabs.map((t) => t.title).indexOf(page ?? GROUP_CHAT_SLUG)
  return (
    <Page rightSidebar={rightSidebar} className="!pb-0">
      <SEO
        title={group.name}
        description={`Created by ${creator.name}. ${group.about}`}
        url={groupPath(group.slug)}
      />
      <Col className="px-3">
        <Row className={'items-center justify-between gap-4'}>
          <div className={'sm:mb-1'}>
            <div
              className={
                'line-clamp-1 my-1 text-lg text-indigo-700 sm:my-3 sm:text-2xl'
              }
            >
              {group.name}
            </div>
            <div className={'hidden sm:block'}>
              <Linkify text={group.about} />
            </div>
          </div>
          <div className="hidden sm:block xl:hidden">
            <JoinOrAddQuestionsButtons
              group={group}
              user={user}
              isMember={!!isMember}
            />
          </div>
        </Row>
        <div className="block sm:hidden">
          <JoinOrAddQuestionsButtons
            group={group}
            user={user}
            isMember={!!isMember}
          />
        </div>
      </Col>
      <Tabs
        currentPageForAnalytics={groupPath(group.slug)}
        className={'mb-0 sm:mb-2'}
        defaultIndex={tabIndex > 0 ? tabIndex : 0}
        tabs={tabs}
      />
    </Page>
  )
}

function JoinOrAddQuestionsButtons(props: {
  group: Group
  user: User | null | undefined
  isMember: boolean
}) {
  const { group, user, isMember } = props
  return user && isMember ? (
    <Row
      className={'-mt-2 justify-between sm:mt-0 sm:flex-col sm:justify-center'}
    >
      <CreateQuestionButton
        user={user}
        overrideText={'Add a new question'}
        className={'hidden w-48 flex-shrink-0 sm:block'}
        query={`?groupId=${group.id}`}
      />
      <CreateQuestionButton
        user={user}
        overrideText={'New question'}
        className={'block w-40 flex-shrink-0 sm:hidden'}
        query={`?groupId=${group.id}`}
      />
      <AddContractButton group={group} user={user} />
    </Row>
  ) : group.anyoneCanJoin ? (
    <JoinGroupButton group={group} user={user} />
  ) : null
}

function GroupOverview(props: {
  group: Group
  creator: User
  user: User | null | undefined
  isCreator: boolean
  members: User[]
}) {
  const { group, creator, isCreator, user, members } = props
  const anyoneCanJoinChoices: { [key: string]: string } = {
    Closed: 'false',
    Open: 'true',
  }
  const [anyoneCanJoin, setAnyoneCanJoin] = useState(group.anyoneCanJoin)
  function updateAnyoneCanJoin(newVal: boolean) {
    if (group.anyoneCanJoin == newVal || !isCreator) return
    setAnyoneCanJoin(newVal)
    toast.promise(updateGroup(group, { ...group, anyoneCanJoin: newVal }), {
      loading: 'Updating group...',
      success: 'Updated group!',
      error: "Couldn't update group",
    })
  }

  return (
    <>
      <Col className="gap-2 rounded-b bg-white p-2">
        <Row className={'flex-wrap justify-between'}>
          <div className={'inline-flex items-center'}>
            <div className="mr-1 text-gray-500">Created by</div>
            <UserLink
              className="text-neutral"
              name={creator.name}
              username={creator.username}
            />
          </div>
          {isCreator ? (
            <EditGroupButton className={'ml-1'} group={group} />
          ) : (
            user &&
            group.memberIds.includes(user?.id) && (
              <Row>
                <JoinOrLeaveGroupButton group={group} />
              </Row>
            )
          )}
        </Row>
        <div className={'block sm:hidden'}>
          <Linkify text={group.about} />
        </div>
        <Row className={'items-center gap-1'}>
          <span className={'text-gray-500'}>Membership</span>
          {user && user.id === creator.id ? (
            <ChoicesToggleGroup
              currentChoice={anyoneCanJoin.toString()}
              choicesMap={anyoneCanJoinChoices}
              setChoice={(choice) =>
                updateAnyoneCanJoin(choice.toString() === 'true')
              }
              toggleClassName={'h-10'}
              className={'ml-2'}
            />
          ) : (
            <span className={'text-gray-700'}>
              {anyoneCanJoin ? 'Open' : 'Closed'}
            </span>
          )}
        </Row>
        {anyoneCanJoin && user && (
          <Row className={'flex-wrap items-center gap-1'}>
            <span className={'text-gray-500'}>Share</span>
            <ShareIconButton
              group={group}
              username={user.username}
              buttonClassName={'hover:bg-gray-300 mt-1 !text-gray-700'}
            >
              <span className={'mx-2'}>
                Invite a friend and get M${REFERRAL_AMOUNT} if they sign up!
              </span>
            </ShareIconButton>
          </Row>
        )}
        <Col className={'mt-2'}>
          <GroupMemberSearch members={members} group={group} />
        </Col>
      </Col>
    </>
  )
}

function SearchBar(props: { setQuery: (query: string) => void }) {
  const { setQuery } = props
  const debouncedQuery = debounce(setQuery, 50)
  return (
    <div className={'relative'}>
      <SearchIcon className={'absolute left-5 top-3.5 h-5 w-5 text-gray-500'} />
      <input
        type="text"
        onChange={(e) => debouncedQuery(e.target.value)}
        placeholder="Find a member"
        className="input input-bordered mb-4 w-full pl-12"
      />
    </div>
  )
}

function GroupMemberSearch(props: { members: User[]; group: Group }) {
  const [query, setQuery] = useState('')
  const { group } = props
  let { members } = props

  // Use static members on load, but also listen to member changes:
  const listenToMembers = useMembers(group)
  if (listenToMembers) {
    members = listenToMembers
  }

  // TODO use find-active-contracts to sort by?
  const matches = sortBy(members, [(member) => member.name]).filter((m) =>
    searchInAny(query, m.name, m.username)
  )
  const matchLimit = 25

  return (
    <div>
      <SearchBar setQuery={setQuery} />
      <Col className={'gap-2'}>
        {matches.length > 0 && (
          <FollowList userIds={matches.slice(0, matchLimit).map((m) => m.id)} />
        )}
        {matches.length > 25 && (
          <div className={'text-center'}>
            And {matches.length - matchLimit} more...
          </div>
        )}
      </Col>
    </div>
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

function GroupLeaderboards(props: {
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
              title="🏅 Bettor rankings"
              header="Profit"
              maxToShow={maxToShow}
            />
            <SortedLeaderboard
              users={members}
              scoreFunction={(user) => creatorScores[user.id] ?? 0}
              title="🏅 Creator rankings"
              header="Market volume"
              maxToShow={maxToShow}
            />
          </>
        ) : (
          <>
            <Leaderboard
              className="max-w-xl"
              title="🏅 Top bettors"
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

function AddContractButton(props: { group: Group; user: User }) {
  const { group } = props
  const [open, setOpen] = useState(false)

  async function addContractToCurrentGroup(contract: Contract) {
    await addContractToGroup(group, contract)
    setOpen(false)
  }

  return (
    <>
      <Modal open={open} setOpen={setOpen} className={'sm:p-0'}>
        <Col
          className={
            'max-h-[60vh] min-h-[60vh] w-full gap-4 rounded-md bg-white p-8'
          }
        >
          <div className={'text-lg text-indigo-700'}>
            Add a question to your group
          </div>
          <div className={'overflow-y-scroll p-1'}>
            <ContractSearch
              hideOrderSelector={true}
              onContractClick={addContractToCurrentGroup}
              overrideGridClassName={'flex grid-cols-1 flex-col gap-3 p-1'}
              showPlaceHolder={true}
              hideQuickBet={true}
              additionalFilter={{ excludeContractIds: group.contractIds }}
            />
          </div>
        </Col>
      </Modal>
      <div className={'flex justify-center'}>
        <button
          className={clsx(
            createButtonStyle,
            'hidden w-48 whitespace-nowrap border border-black text-black hover:bg-black hover:text-white sm:block'
          )}
          onClick={() => setOpen(true)}
        >
          Add an old question
        </button>
        <button
          className={clsx(
            createButtonStyle,
            'block w-40 whitespace-nowrap border border-black text-black hover:bg-black hover:text-white sm:hidden'
          )}
          onClick={() => setOpen(true)}
        >
          Old question
        </button>
      </div>
    </>
  )
}

function JoinGroupButton(props: {
  group: Group
  user: User | null | undefined
}) {
  const { group, user } = props
  function addUserToGroup() {
    if (user && !group.memberIds.includes(user.id)) {
      toast.promise(joinGroup(group, user.id), {
        loading: 'Joining group...',
        success: 'Joined group!',
        error: "Couldn't join group, try again?",
      })
    }
  }
  return (
    <div>
      <button
        onClick={user ? addUserToGroup : firebaseLogin}
        className={'btn-md btn-outline btn whitespace-nowrap normal-case'}
      >
        {user ? 'Join group' : 'Login to join group'}
      </button>
    </div>
  )
}
