import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { toast } from 'react-hot-toast'

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
import { useUser, useUserById } from 'web/hooks/use-user'
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
import { getPost, listPosts, postPath } from 'web/lib/firebase/posts'
import { Post } from 'common/post'
import { Spacer } from 'web/components/layout/spacer'
import { usePost, usePosts } from 'web/hooks/use-post'
import { useAdmin } from 'web/hooks/use-admin'
import { track } from '@amplitude/analytics-browser'
import { ArrowLeftIcon } from '@heroicons/react/solid'
import { SelectMarketsModal } from 'web/components/contract-select-modal'
import { BETTORS } from 'common/user'
import { Page } from 'web/components/page'
import { Tabs } from 'web/components/layout/tabs'
import { Avatar } from 'web/components/avatar'
import { Title } from 'web/components/title'
import { fromNow } from 'web/lib/util/time'
import { CreatePost } from 'web/components/create-post'

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
    group && group.aboutPostId != null ? await getPost(group.aboutPostId) : null

  const messages = group && (await listAllCommentsOnGroup(group.id))

  const cachedTopTraderIds =
    (group && group.cachedLeaderboard?.topTraders) ?? []
  const cachedTopCreatorIds =
    (group && group.cachedLeaderboard?.topCreators) ?? []
  const topTraders = await toTopUsers(cachedTopTraderIds)

  const topCreators = await toTopUsers(cachedTopCreatorIds)

  const creator = await creatorPromise

  const posts = ((group && (await listPosts(group.postIds))) ?? []).filter(
    (p) => p != null
  ) as Post[]
  return {
    props: {
      group,
      memberIds,
      creator,
      topTraders,
      topCreators,
      messages,
      aboutPost,
      suggestedFilter,
      posts,
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
  'posts',
] as const

export default function GroupPage(props: {
  group: Group | null
  memberIds: string[]
  creator: User
  topTraders: { user: User; score: number }[]
  topCreators: { user: User; score: number }[]
  messages: GroupComment[]
  aboutPost: Post | null
  suggestedFilter: 'open' | 'all'
  posts: Post[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    group: null,
    memberIds: [],
    creator: null,
    topTraders: [],
    topCreators: [],
    messages: [],
    suggestedFilter: 'open',
    posts: [],
  }
  const { creator, topTraders, topCreators, suggestedFilter, posts } = props

  const router = useRouter()
  const { slugs } = router.query as { slugs: string[] }
  const page = slugs?.[1] as typeof groupSubpages[number]

  const group = useGroup(props.group?.id) ?? props.group
  const aboutPost = usePost(props.aboutPost?.id) ?? props.aboutPost

  let groupPosts = usePosts(group?.postIds ?? []) ?? posts

  if (aboutPost != null) {
    groupPosts = [aboutPost, ...groupPosts]
  }

  const user = useUser()
  const isAdmin = useAdmin()
  const memberIds = useMemberIds(group?.id ?? null) ?? props.memberIds

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

  const leaderboardTab = (
    <Col>
      <div className="mt-4 flex flex-col gap-8 px-4 md:flex-row">
        <GroupLeaderboard
          topUsers={topTraders}
          title={`🏅 Top ${BETTORS}`}
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

  const postsPage = (
    <>
      <Col>
        <div className="mt-4 flex flex-col gap-8 px-4 md:flex-row">
          {posts && <GroupPosts posts={groupPosts} group={group} />}
        </div>
      </Col>
    </>
  )

  const aboutTab = (
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

  const questionsTab = (
    <>
      <div className={'flex justify-end '}>
        <div
          className={
            'flex items-end justify-self-end px-2 md:absolute md:top-0 md:pb-2'
          }
        >
          <div>
            <JoinOrAddQuestionsButtons
              group={group}
              user={user}
              isMember={!!isMember}
            />
          </div>
        </div>
      </div>
      <ContractSearch
        headerClassName="md:sticky"
        user={user}
        defaultSort={'score'}
        defaultFilter={suggestedFilter}
        additionalFilter={{ groupSlug: group.slug }}
        persistPrefix={`group-${group.slug}`}
        includeProbSorts
      />
    </>
  )

  const tabs = [
    {
      title: 'Markets',
      content: questionsTab,
    },
    {
      title: 'Leaderboards',
      content: leaderboardTab,
    },
    {
      title: 'About',
      content: aboutTab,
    },
    {
      title: 'Posts',
      content: postsPage,
    },
  ]

  return (
    <Page logoSubheading={group.name}>
      <SEO
        title={group.name}
        description={`Created by ${creator.name}. ${group.about}`}
        url={groupPath(group.slug)}
      />
      <TopGroupNavBar group={group} />
      <div className={'relative p-2 pt-0 md:pt-2'}>
        <Tabs className={'mb-2'} tabs={tabs} />
      </div>
    </Page>
  )
}

export function TopGroupNavBar(props: { group: Group }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 md:hidden lg:col-span-12">
      <div className="flex items-center   bg-white  px-4">
        <div className="flex-shrink-0">
          <Link href="/">
            <a className="text-indigo-700 hover:text-gray-500 ">
              <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
            </a>
          </Link>
        </div>
        <div className="ml-3">
          <h1 className="text-lg font-medium text-indigo-700">
            {props.group.name}
          </h1>
        </div>
      </div>
    </header>
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
    <Row className={'mb-2 w-full self-start md:mt-2 '}>
      <AddContractButton group={group} user={user} />
    </Row>
  ) : group.anyoneCanJoin ? (
    <div className="mb-2 md:mb-0">
      <JoinGroupButton group={group} user={user} />
    </div>
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
      entries={topUsers.map((t) => t.user)}
      title={title}
      columns={[
        { header, renderCell: (user) => formatMoney(scoresByUser[user.id]) },
      ]}
      maxToShow={maxToShow}
    />
  )
}

function GroupPosts(props: { posts: Post[]; group: Group }) {
  const { posts, group } = props
  const [showCreatePost, setShowCreatePost] = useState(false)
  const user = useUser()

  const createPost = <CreatePost group={group} />

  const postList = (
    <div className=" align-start w-full items-start">
      <Row className="flex justify-between">
        <Col>
          <Title text={'Posts'} className="!mt-0" />
        </Col>
        <Col>
          {user && (
            <Button
              className="btn-md"
              onClick={() => setShowCreatePost(!showCreatePost)}
            >
              Add a Post
            </Button>
          )}
        </Col>
      </Row>

      <div className="mt-2">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
        {posts.length === 0 && (
          <div className="text-center text-gray-500">No posts yet</div>
        )}
      </div>
    </div>
  )

  return showCreatePost ? createPost : postList
}

function PostCard(props: { post: Post }) {
  const { post } = props
  const creatorId = post.creatorId

  const user = useUserById(creatorId)

  if (!user) return <> </>

  return (
    <div className="py-1">
      <Link href={postPath(post.slug)}>
        <Row
          className={
            'relative gap-3 rounded-lg bg-white p-2 shadow-md hover:cursor-pointer hover:bg-gray-100'
          }
        >
          <div className="flex-shrink-0">
            <Avatar className="h-12 w-12" username={user?.username} />
          </div>
          <div className="">
            <div className="text-sm text-gray-500">
              <UserLink
                className="text-neutral"
                name={user?.name}
                username={user?.username}
              />
              <span className="mx-1">•</span>
              <span className="text-gray-500">{fromNow(post.createdTime)}</span>
            </div>
            <div className="text-lg font-medium text-gray-900">
              {post.title}
            </div>
          </div>
        </Row>
      </Link>
    </div>
  )
}

function AddContractButton(props: { group: Group; user: User }) {
  const { group, user } = props
  const [open, setOpen] = useState(false)
  const groupContractIds = useGroupContractIds(group.id)

  async function onSubmit(contracts: Contract[]) {
    await Promise.all(
      contracts.map((contract) => addContractToGroup(group, contract, user.id))
    )
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

      <SelectMarketsModal
        open={open}
        setOpen={setOpen}
        title="Add markets"
        description={
          <div className={'text-md my-4 text-gray-600'}>
            Add pre-existing markets to this group, or{' '}
            <Link href={`/create?groupId=${group.id}`}>
              <span className="cursor-pointer font-semibold underline">
                create a new one
              </span>
            </Link>
            .
          </div>
        }
        submitLabel={(len) => `Add ${len} question${len !== 1 ? 's' : ''}`}
        onSubmit={onSubmit}
        contractSearchOptions={{
          additionalFilter: { excludeContractIds: groupContractIds },
        }}
      />
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
