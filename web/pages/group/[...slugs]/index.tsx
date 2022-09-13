import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { toast, Toaster } from 'react-hot-toast'

import { Group, GROUP_CHAT_SLUG } from 'common/group'
import { Contract, listContractsByGroupSlug } from 'web/lib/firebase/contracts'
import {
  addContractToGroup,
  getGroupBySlug,
  groupPath,
  joinGroup,
  listMemberIds,
  updateGroup,
} from 'web/lib/firebase/groups'
import { Row } from 'web/components/layout/row'
import { firebaseLogin, getUser, User } from 'web/lib/firebase/users'
import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'
import {
  useGroup,
  useGroupContractIds,
  useMemberIds,
} from 'web/hooks/use-group'
import { Leaderboard } from 'web/components/leaderboard'
import { formatMoney } from 'common/util/format'
import { EditGroupButton } from 'web/components/groups/edit-group-button'
import Custom404 from '../../404'
import { SEO } from 'web/components/SEO'
import { Linkify } from 'web/components/linkify'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { Modal } from 'web/components/layout/modal'
import { ChoicesToggleGroup } from 'web/components/choices-toggle-group'
import { ContractSearch } from 'web/components/contract-search'
import { JoinOrLeaveGroupButton } from 'web/components/groups/groups-button'
import { CopyLinkButton } from 'web/components/copy-link-button'
import { ENV_CONFIG } from 'common/envs/constants'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { Button } from 'web/components/button'
import { listAllCommentsOnGroup } from 'web/lib/firebase/comments'
import { GroupComment } from 'common/comment'
import { REFERRAL_AMOUNT } from 'common/economy'
import { UserLink } from 'web/components/user-link'
import { GroupAboutPost } from 'web/components/groups/group-about-post'
import { getPost } from 'web/lib/firebase/posts'
import { Post } from 'common/post'
import { Spacer } from 'web/components/layout/spacer'
import { usePost } from 'web/hooks/use-post'
import { useAdmin } from 'web/hooks/use-admin'
import { track } from '@amplitude/analytics-browser'
import GroupSidebar from 'web/components/nav/group-sidebar'
import { GroupNavBar } from 'web/components/nav/group-nav-bar'
import { ArrowLeftIcon } from '@heroicons/react/solid'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const group = await getGroupBySlug(slugs[0])
  const memberIds = group && (await listMemberIds(group))
  const creatorPromise = group ? getUser(group.creatorId) : null

  const contracts =
    (group && (await listContractsByGroupSlug(group.slug))) ?? []
  const now = Date.now()
  const suggestedFilter =
    contracts.filter((c) => (c.closeTime ?? 0) > now).length < 5
      ? 'all'
      : 'open'
  const aboutPost =
    group && group.aboutPostId != null && (await getPost(group.aboutPostId))
  const messages = group && (await listAllCommentsOnGroup(group.id))

  const cachedTopTraderIds =
    (group && group.cachedLeaderboard?.topTraders) ?? []
  const cachedTopCreatorIds =
    (group && group.cachedLeaderboard?.topCreators) ?? []
  const topTraders = await toTopUsers(cachedTopTraderIds)

  const topCreators = await toTopUsers(cachedTopCreatorIds)

  const creator = await creatorPromise
  // Only count unresolved markets
  const contractsCount = contracts.filter((c) => !c.isResolved).length

  return {
    props: {
      contractsCount,
      group,
      memberIds,
      creator,
      topTraders,
      topCreators,
      messages,
      aboutPost,
      suggestedFilter,
    },

    revalidate: 60, // regenerate after a minute
  }
}
export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}
const groupSubpages = [
  undefined,
  GROUP_CHAT_SLUG,
  'markets',
  'leaderboards',
  'about',
] as const

export default function GroupPage(props: {
  contractsCount: number
  group: Group | null
  memberIds: string[]
  creator: User
  topTraders: { user: User; score: number }[]
  topCreators: { user: User; score: number }[]
  messages: GroupComment[]
  aboutPost: Post
  suggestedFilter: 'open' | 'all'
}) {
  props = usePropz(props, getStaticPropz) ?? {
    contractsCount: 0,
    group: null,
    memberIds: [],
    creator: null,
    topTraders: [],
    topCreators: [],
    messages: [],
    suggestedFilter: 'open',
  }
  const { contractsCount, creator, topTraders, topCreators, suggestedFilter } =
    props

  const router = useRouter()
  const { slugs } = router.query as { slugs: string[] }
  const page = slugs?.[1] as typeof groupSubpages[number]

  const group = useGroup(props.group?.id) ?? props.group
  const aboutPost = usePost(props.aboutPost?.id) ?? props.aboutPost

  const user = useUser()
  const isAdmin = useAdmin()
  const memberIds = useMemberIds(group?.id ?? null) ?? props.memberIds
  const [sidebarIndex, setSidebarIndex] = useState(0)

  useSaveReferral(user, {
    defaultReferrerUsername: creator.username,
    groupId: group?.id,
  })

  if (group === null || !groupSubpages.includes(page) || slugs[2]) {
    return <Custom404 />
  }
  const isCreator = user && group && user.id === group.creatorId
  const isMember = user && memberIds.includes(user.id)
  const maxLeaderboardSize = 50

  const leaderboardPage = (
    <Col>
      <div className="mt-4 flex flex-col gap-8 px-4 md:flex-row">
        <GroupLeaderboard
          topUsers={topTraders}
          title="🏅 Top traders"
          header="Profit"
          maxToShow={maxLeaderboardSize}
        />
        <GroupLeaderboard
          topUsers={topCreators}
          title="🏅 Top creators"
          header="Market volume"
          maxToShow={maxLeaderboardSize}
        />
      </div>
    </Col>
  )

  const aboutPage = (
    <Col>
      {(group.aboutPostId != null || isCreator || isAdmin) && (
        <GroupAboutPost
          group={group}
          isEditable={!!isCreator || isAdmin}
          post={aboutPost}
        />
      )}
      <Spacer h={3} />
      <GroupOverview
        group={group}
        creator={creator}
        isCreator={!!isCreator}
        user={user}
        memberIds={memberIds}
      />
    </Col>
  )

  const questionsPage = (
    <>
      {/* align the divs to the right */}
      <div className={' flex justify-end px-2 pb-2 sm:hidden'}>
        <div>
          <JoinGroupButton group={group} user={user} />
        </div>
      </div>
      <ContractSearch
        user={user}
        defaultSort={'newest'}
        defaultFilter={suggestedFilter}
        additionalFilter={{ groupSlug: group.slug }}
        persistPrefix={`group-${group.slug}`}
      />
    </>
  )

  const sidebarPages = [
    {
      badge: `${contractsCount}`,
      title: 'Markets',
      content: questionsPage,
      href: groupPath(group.slug, 'markets'),
      key: 'markets',
    },
    {
      title: 'Leaderboards',
      content: leaderboardPage,
      href: groupPath(group.slug, 'leaderboards'),
      key: 'leaderboards',
    },
    {
      title: 'About',
      content: aboutPage,
      href: groupPath(group.slug, 'about'),
      key: 'about',
    },
  ]

  const pageContent = sidebarPages[sidebarIndex].content
  const onSidebarClick = (key: string) => {
    const index = sidebarPages.findIndex((t) => t.key === key)
    setSidebarIndex(index)
  }

  const joinOrAddQuestionsButton = (
    <JoinOrAddQuestionsButtons
      group={group}
      user={user}
      isMember={!!isMember}
    />
  )

  return (
    <>
      <header className="sticky top-0 z-50 w-full pb-2 md:hidden lg:col-span-12">
        <div className="flex items-center  border-b border-gray-200 bg-white  px-4">
          <div className="flex-shrink-0">
            <Link href="/">
              <a className="text-indigo-700 hover:text-gray-500 ">
                <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
              </a>
            </Link>
          </div>
          <div className="ml-3">
            <h1 className="text-lg font-medium text-indigo-700">
              {group.name}
            </h1>
          </div>
        </div>
      </header>
      <div>
        <div
          className={
            'mx-auto w-full pb-[58px] lg:grid lg:grid-cols-12 lg:gap-x-2 lg:pb-0 xl:max-w-7xl xl:gap-x-8'
          }
        >
          <Toaster />
          <GroupSidebar
            groupName={group.name}
            className="sticky top-0 hidden divide-gray-300 self-start pl-2 lg:col-span-2 lg:flex"
            onClick={onSidebarClick}
            joinOrAddQuestionsButton={joinOrAddQuestionsButton}
            currentKey={sidebarPages[sidebarIndex].key}
          />

          <SEO
            title={group.name}
            description={`Created by ${creator.name}. ${group.about}`}
            url={groupPath(group.slug)}
          />
          <main className={'px-2 pt-1 xl:col-span-8'}>{pageContent}</main>
        </div>
        <GroupNavBar
          currentPage={sidebarPages[sidebarIndex].key}
          onClick={onSidebarClick}
        />
      </div>
    </>
  )
}

function JoinOrAddQuestionsButtons(props: {
  group: Group
  user: User | null | undefined
  isMember: boolean
  className?: string
}) {
  const { group, user, isMember } = props
  return user && isMember ? (
    <Row className={'w-full self-start pt-4'}>
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
  memberIds: string[]
}) {
  const { group, creator, isCreator, user, memberIds } = props
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
  const postFix = user ? '?referrer=' + user.username : ''
  const shareUrl = `https://${ENV_CONFIG.domain}${groupPath(
    group.slug
  )}${postFix}`
  const isMember = user ? memberIds.includes(user.id) : false

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
            user && (
              <Row>
                <JoinOrLeaveGroupButton
                  group={group}
                  user={user}
                  isMember={isMember}
                />
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
              {anyoneCanJoin ? 'Open to all' : 'Closed (by invite only)'}
            </span>
          )}
        </Row>

        {anyoneCanJoin && user && (
          <Col className="my-4 px-2">
            <div className="text-lg">Invite</div>
            <div className={'mb-2 text-gray-500'}>
              Invite a friend to this group and get M${REFERRAL_AMOUNT} if they
              sign up!
            </div>

            <CopyLinkButton
              url={shareUrl}
              tracking="copy group share link"
              buttonClassName="btn-md rounded-l-none"
              toastClassName={'-left-28 mt-1'}
            />
          </Col>
        )}
      </Col>
    </>
  )
}

function GroupLeaderboard(props: {
  topUsers: { user: User; score: number }[]
  title: string
  maxToShow: number
  header: string
}) {
  const { topUsers, title, maxToShow, header } = props

  const scoresByUser = topUsers.reduce((acc, { user, score }) => {
    acc[user.id] = score
    return acc
  }, {} as { [key: string]: number })

  return (
    <Leaderboard
      className="max-w-xl"
      users={topUsers.map((t) => t.user)}
      title={title}
      columns={[
        { header, renderCell: (user) => formatMoney(scoresByUser[user.id]) },
      ]}
      maxToShow={maxToShow}
    />
  )
}

function AddContractButton(props: { group: Group; user: User }) {
  const { group, user } = props
  const [open, setOpen] = useState(false)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(false)
  const groupContractIds = useGroupContractIds(group.id)

  async function addContractToCurrentGroup(contract: Contract) {
    if (contracts.map((c) => c.id).includes(contract.id)) {
      setContracts(contracts.filter((c) => c.id !== contract.id))
    } else setContracts([...contracts, contract])
  }

  async function doneAddingContracts() {
    Promise.all(
      contracts.map(async (contract) => {
        setLoading(true)
        await addContractToGroup(group, contract, user.id)
      })
    ).then(() => {
      setLoading(false)
      setOpen(false)
      setContracts([])
    })
  }

  return (
    <>
      <div className={'flex w-full justify-center'}>
        <Button
          className="w-full whitespace-nowrap"
          size="md"
          color="indigo"
          onClick={() => setOpen(true)}
        >
          Add market
        </Button>
      </div>

      <Modal
        open={open}
        setOpen={setOpen}
        className={'max-w-4xl sm:p-0'}
        size={'xl'}
      >
        <Col
          className={'min-h-screen w-full max-w-4xl gap-4 rounded-md bg-white'}
        >
          <Col className="p-8 pb-0">
            <div className={'text-xl text-indigo-700'}>Add markets</div>

            <div className={'text-md my-4 text-gray-600'}>
              Add pre-existing markets to this group, or{' '}
              <Link href={`/create?groupId=${group.id}`}>
                <span className="cursor-pointer font-semibold underline">
                  create a new one
                </span>
              </Link>
              .
            </div>

            {contracts.length > 0 && (
              <Col className={'w-full '}>
                {!loading ? (
                  <Row className={'justify-end gap-4'}>
                    <Button onClick={doneAddingContracts} color={'indigo'}>
                      Add {contracts.length} question
                      {contracts.length > 1 && 's'}
                    </Button>
                    <Button
                      onClick={() => {
                        setContracts([])
                      }}
                      color={'gray'}
                    >
                      Cancel
                    </Button>
                  </Row>
                ) : (
                  <Row className={'justify-center'}>
                    <LoadingIndicator />
                  </Row>
                )}
              </Col>
            )}
          </Col>

          <div className={'overflow-y-scroll sm:px-8'}>
            <ContractSearch
              user={user}
              hideOrderSelector={true}
              onContractClick={addContractToCurrentGroup}
              cardHideOptions={{ hideGroupLink: true, hideQuickBet: true }}
              additionalFilter={{
                excludeContractIds: groupContractIds,
              }}
              highlightOptions={{
                contractIds: contracts.map((c) => c.id),
                highlightClassName: '!bg-indigo-100 border-indigo-100 border-2',
              }}
            />
          </div>
        </Col>
      </Modal>
    </>
  )
}

function JoinGroupButton(props: {
  group: Group
  user: User | null | undefined
}) {
  const { group, user } = props

  const follow = async () => {
    track('join group')
    const userId = user ? user.id : (await firebaseLogin()).user.uid

    toast.promise(joinGroup(group, userId), {
      loading: 'Following group...',
      success: 'Followed',
      error: "Couldn't follow group, try again?",
    })
  }

  return (
    <div>
      <button
        onClick={follow}
        className={
          'btn-md btn-outline btn w-full whitespace-nowrap normal-case'
        }
      >
        Follow
      </button>
    </div>
  )
}

const toTopUsers = async (
  cachedUserIds: { userId: string; score: number }[]
): Promise<{ user: User; score: number }[]> =>
  (
    await Promise.all(
      cachedUserIds.map(async (e) => {
        const user = await getUser(e.userId)
        return { user, score: e.score ?? 0 }
      })
    )
  ).filter((e) => e.user != null)
