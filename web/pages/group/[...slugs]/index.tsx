import { take, sortBy, debounce } from 'lodash'

import { Group } from 'common/group'
import { Page } from 'web/components/page'
import { Title } from 'web/components/title'
import { listAllBets } from 'web/lib/firebase/bets'
import { Contract, listenForUserContracts } from 'web/lib/firebase/contracts'
import {
  groupPath,
  getGroupBySlug,
  getGroupContracts,
  updateGroup,
} from 'web/lib/firebase/groups'
import { Row } from 'web/components/layout/row'
import { UserLink } from 'web/components/user-page'
import {
  firebaseLogin,
  getUser,
  User,
  writeReferralInfo,
} from 'web/lib/firebase/users'
import { Spacer } from 'web/components/layout/spacer'
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
import { ContractsGrid } from 'web/components/contract/contracts-list'
import { CreateQuestionButton } from 'web/components/create-question-button'
import React, { useEffect, useState } from 'react'
import { GroupChat } from 'web/components/groups/group-chat'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { Modal } from 'web/components/layout/modal'
import { PlusIcon } from '@heroicons/react/outline'
import { checkAgainstQuery } from 'web/hooks/use-sort-and-query-params'
import { ChoicesToggleGroup } from 'web/components/choices-toggle-group'
import { toast } from 'react-hot-toast'
import { useCommentsOnGroup } from 'web/hooks/use-comments'
import ShortToggle from 'web/components/widgets/short-toggle'
import { ShareIconButton } from 'web/components/share-icon-button'
import { REFERRAL_AMOUNT } from 'common/user'
import { SiteLink } from 'web/components/site-link'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const group = await getGroupBySlug(slugs[0])
  const members = group ? await listMembers(group) : []
  const creatorPromise = group ? getUser(group.creatorId) : null

  const contracts = group ? await getGroupContracts(group).catch((_) => []) : []

  const bets = await Promise.all(
    contracts.map((contract: Contract) => listAllBets(contract.id))
  )

  const creatorScores = scoreCreators(contracts)
  const traderScores = scoreTraders(contracts, bets)
  const [topCreators, topTraders] = await Promise.all([
    toTopUsers(creatorScores),
    toTopUsers(traderScores),
  ])

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

async function toTopUsers(userScores: { [userId: string]: number }) {
  const topUserPairs = take(
    sortBy(Object.entries(userScores), ([_, score]) => -1 * score),
    10
  ).filter(([_, score]) => score >= 0.5)

  const topUsers = await Promise.all(
    topUserPairs.map(([userId]) => getUser(userId))
  )
  return topUsers.filter((user) => user)
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}
const groupSubpages = [undefined, 'chat', 'questions', 'about'] as const

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
  const page = (slugs?.[1] ?? 'chat') as typeof groupSubpages[number]

  const group = useGroup(props.group?.id) ?? props.group
  const [contracts, setContracts] = useState<Contract[] | undefined>(undefined)
  const [query, setQuery] = useState('')

  const messages = useCommentsOnGroup(group?.id)
  const debouncedQuery = debounce(setQuery, 50)
  const filteredContracts =
    query != '' && contracts
      ? contracts.filter(
          (c) =>
            checkAgainstQuery(query, c.question) ||
            checkAgainstQuery(query, c.description || '') ||
            checkAgainstQuery(query, c.creatorName) ||
            checkAgainstQuery(query, c.creatorUsername)
        )
      : []

  useEffect(() => {
    if (group)
      getGroupContracts(group).then((contracts) => setContracts(contracts))
  }, [group])

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
      <JoinOrCreateButton group={group} user={user} isMember={!!isMember} />
      <Spacer h={6} />
      {contracts && (
        <div className={'mt-2'}>
          <div className={'my-2 text-gray-500'}>Recent Questions</div>
          <ContractsGrid
            contracts={contracts
              .sort((a, b) => b.createdTime - a.createdTime)
              .slice(0, 3)}
            hasMore={false}
            loadMore={() => {}}
            overrideGridClassName={'grid w-full grid-cols-1 gap-4'}
          />
        </div>
      )}
    </Col>
  )

  const aboutTab = (
    <Col>
      <GroupOverview
        group={group}
        creator={creator}
        isCreator={!!isCreator}
        user={user}
      />
      <Spacer h={8} />

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
  return (
    <Page rightSidebar={rightSidebar}>
      <SEO
        title={group.name}
        description={`Created by ${creator.name}. ${group.about}`}
        url={groupPath(group.slug)}
      />

      <Col className="px-3 lg:px-1">
        <Row className={'items-center justify-between gap-4'}>
          <div className={'mb-1'}>
            <Title className={'line-clamp-2'} text={group.name} />
            <Linkify text={group.about} />
          </div>
          <div className="hidden sm:block xl:hidden">
            <JoinOrCreateButton
              group={group}
              user={user}
              isMember={!!isMember}
            />
          </div>
        </Row>
        <div className="block sm:hidden">
          <JoinOrCreateButton group={group} user={user} isMember={!!isMember} />
        </div>
      </Col>

      <Tabs
        defaultIndex={page === 'about' ? 2 : page === 'questions' ? 1 : 0}
        tabs={[
          {
            title: 'Chat',
            content: messages ? (
              <GroupChat messages={messages} user={user} group={group} />
            ) : (
              <LoadingIndicator />
            ),
            href: groupPath(group.slug, 'chat'),
          },
          {
            title: 'Questions',
            content: (
              <div className={'mt-2 px-1'}>
                {contracts ? (
                  contracts.length > 0 ? (
                    <>
                      <input
                        type="text"
                        onChange={(e) => debouncedQuery(e.target.value)}
                        placeholder="Search the group's questions"
                        className="input input-bordered mb-4 w-full"
                      />
                      <ContractsGrid
                        contracts={query != '' ? filteredContracts : contracts}
                        hasMore={false}
                        loadMore={() => {}}
                      />
                    </>
                  ) : (
                    <div className="p-2 text-gray-500">
                      No questions yet. Why not{' '}
                      <SiteLink
                        href={`/create/?groupId=${group.id}`}
                        className={'font-bold text-gray-700'}
                      >
                        add one?
                      </SiteLink>
                    </div>
                  )
                ) : (
                  <LoadingIndicator />
                )}
                {isMember && <AddContractButton group={group} user={user} />}
              </div>
            ),
            href: groupPath(group.slug, 'questions'),
          },
          {
            title: 'About',
            content: aboutTab,
            href: groupPath(group.slug, 'about'),
          },
        ]}
      />
    </Page>
  )
}

function JoinOrCreateButton(props: {
  group: Group
  user: User | null | undefined
  isMember: boolean
}) {
  const { group, user, isMember } = props
  return isMember ? (
    <CreateQuestionButton
      user={user}
      overrideText={'Add a new question'}
      className={'w-48 flex-shrink-0'}
      query={`?groupId=${group.id}`}
    />
  ) : group.anyoneCanJoin ? (
    <JoinGroupButton group={group} user={user} />
  ) : null
}

function GroupOverview(props: {
  group: Group
  creator: User
  user: User | null | undefined
  isCreator: boolean
}) {
  const { group, creator, isCreator, user } = props
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
    <Col>
      <Col className="gap-2 rounded-b bg-white p-4">
        <Row className={'flex-wrap justify-between'}>
          <div className={'inline-flex items-center'}>
            <div className="mr-1 text-gray-500">Created by</div>
            <UserLink
              className="text-neutral"
              name={creator.name}
              username={creator.username}
            />
          </div>
          {isCreator && <EditGroupButton className={'ml-1'} group={group} />}
        </Row>
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
            <span className={'text-gray-500'}>Sharing</span>
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
      </Col>
    </Col>
  )
}

export function GroupMembersList(props: { group: Group }) {
  const { group } = props
  const members = useMembers(group)
  const maxMambersToShow = 5
  if (group.memberIds.length === 1) return <div />
  return (
    <div>
      <div>
        <div className="text-neutral flex flex-wrap gap-1">
          <span className={'text-gray-500'}>Other members</span>
          {members.slice(0, maxMambersToShow).map((member, i) => (
            <div key={member.id} className={'flex-shrink'}>
              <UserLink name={member.name} username={member.username} />
              {members.length > 1 && i !== members.length - 1 && <span>,</span>}
            </div>
          ))}
          {members.length > maxMambersToShow && (
            <span> & {members.length - maxMambersToShow} more</span>
          )}
        </div>
      </div>
    </div>
  )
}

function SortedLeaderboard(props: {
  users: User[]
  scoreFunction: (user: User) => number
  title: string
  header: string
}) {
  const { users, scoreFunction, title, header } = props
  const sortedUsers = users.sort((a, b) => scoreFunction(b) - scoreFunction(a))
  return (
    <Leaderboard
      className="max-w-xl"
      users={sortedUsers}
      title={title}
      columns={[
        { header, renderCell: (user) => formatMoney(scoreFunction(user)) },
      ]}
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
  const [includeOutsiders, setIncludeOutsiders] = useState(false)

  // Consider hiding M$0
  return (
    <Col>
      <Row className="items-center justify-end gap-4 text-gray-500">
        Include all users
        <ShortToggle
          enabled={includeOutsiders}
          setEnabled={setIncludeOutsiders}
        />
      </Row>

      <div className="mt-4 flex flex-col gap-8 px-4 md:flex-row">
        {!includeOutsiders ? (
          <>
            <SortedLeaderboard
              users={members}
              scoreFunction={(user) => traderScores[user.id] ?? 0}
              title="🏅 Top bettors"
              header="Profit"
            />
            <SortedLeaderboard
              users={members}
              scoreFunction={(user) => creatorScores[user.id] ?? 0}
              title="🏅 Top creators"
              header="Market volume"
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
            />
          </>
        )}
      </div>
    </Col>
  )
}

function AddContractButton(props: { group: Group; user: User }) {
  const { group, user } = props
  const [open, setOpen] = useState(false)
  const [contracts, setContracts] = useState<Contract[] | undefined>(undefined)
  const [query, setQuery] = useState('')

  useEffect(() => {
    return listenForUserContracts(user.id, (contracts) => {
      setContracts(contracts.filter((c) => !group.contractIds.includes(c.id)))
    })
  }, [group.contractIds, user.id])

  async function addContractToGroup(contract: Contract) {
    await updateGroup(group, {
      ...group,
      contractIds: [...group.contractIds, contract.id],
    })
    setOpen(false)
  }

  // TODO use find-active-contracts to sort by?
  const matches = sortBy(contracts, [
    (contract) => -1 * contract.createdTime,
  ]).filter(
    (c) =>
      checkAgainstQuery(query, c.question) ||
      checkAgainstQuery(query, c.description) ||
      checkAgainstQuery(query, c.tags.flat().join(' '))
  )
  const debouncedQuery = debounce(setQuery, 50)
  return (
    <>
      <Modal open={open} setOpen={setOpen}>
        <Col className={'max-h-[60vh] w-full gap-4 rounded-md bg-white p-8'}>
          <div className={'text-lg text-indigo-700'}>
            Add a question to your group
          </div>
          <input
            type="text"
            onChange={(e) => debouncedQuery(e.target.value)}
            placeholder="Search your questions"
            className="input input-bordered mb-4 w-full"
          />
          <div className={'overflow-y-scroll'}>
            {contracts ? (
              <ContractsGrid
                contracts={matches}
                loadMore={() => {}}
                hasMore={false}
                onContractClick={(contract) => {
                  addContractToGroup(contract)
                }}
                overrideGridClassName={'flex grid-cols-1 flex-col gap-3 p-1'}
                hideQuickBet={true}
              />
            ) : (
              <LoadingIndicator />
            )}
          </div>
        </Col>
      </Modal>
      <Row className={'items-center justify-center'}>
        <button
          className={
            'btn btn-sm btn-outline cursor-pointer gap-2 whitespace-nowrap text-sm normal-case'
          }
          onClick={() => setOpen(true)}
        >
          <PlusIcon className="mr-1 h-5 w-5" />
          Add old questions to this group
        </button>
      </Row>
    </>
  )
}

function JoinGroupButton(props: {
  group: Group
  user: User | null | undefined
}) {
  const { group, user } = props
  function joinGroup() {
    if (user && !group.memberIds.includes(user.id)) {
      toast.promise(
        updateGroup(group, {
          ...group,
          memberIds: [...group.memberIds, user.id],
        }),
        {
          loading: 'Joining group...',
          success: 'Joined group!',
          error: "Couldn't join group",
        }
      )
    }
  }
  return (
    <div>
      <button
        onClick={user ? joinGroup : firebaseLogin}
        className={'btn-md btn-outline btn whitespace-nowrap normal-case'}
      >
        {user ? 'Join group' : 'Login to join group'}
      </button>
    </div>
  )
}
