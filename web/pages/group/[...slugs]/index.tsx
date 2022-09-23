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
import Custom404 from '../../404'
import { SEO } from 'web/components/SEO'
import { fromPropz, usePropz } from 'web/hooks/use-propz'

import { ContractSearch } from 'web/components/contract-search'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { Button } from 'web/components/button'
import { listAllCommentsOnGroup } from 'web/lib/firebase/comments'
import { GroupComment } from 'common/comment'
import { getPost, listPosts } from 'web/lib/firebase/posts'
import { Post } from 'common/post'
import { usePost, usePosts } from 'web/hooks/use-post'
import { useAdmin } from 'web/hooks/use-admin'
import { track } from '@amplitude/analytics-browser'
import { ArrowLeftIcon } from '@heroicons/react/solid'
import { SelectMarketsModal } from 'web/components/contract-select-modal'
import { BETTORS } from 'common/user'
import { Page } from 'web/components/page'
import { Tabs } from 'web/components/layout/tabs'
import { Title } from 'web/components/title'
import { CreatePost } from 'web/components/create-post'
import { GroupOverview } from 'web/components/groups/group-overview'
import { CardHighlightOptions } from 'web/components/contract/contracts-grid'
import { PostCard } from 'web/components/post-card'

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

  const overviewPage = (
    <>
      <GroupOverview
        group={group}
        posts={groupPosts}
        isEditable={!!isCreator || isAdmin}
        aboutPost={aboutPost}
        creator={creator}
        user={user}
        memberIds={memberIds}
      />
    </>
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
      title: 'Posts',
      content: postsPage,
    },
    {
      title: 'Overview',
      content: overviewPage,
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

export function GroupPosts(props: { posts: Post[]; group: Group }) {
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
        <PostCardList posts={posts} />
        {posts.length === 0 && (
          <div className="text-center text-gray-500">No posts yet</div>
        )}
      </div>
    </div>
  )

  return showCreatePost ? createPost : postList
}

export function PostCardList(props: {
  posts: Post[]
  highlightOptions?: CardHighlightOptions
  onPostClick?: (post: Post) => void
}) {
  const { posts, onPostClick, highlightOptions } = props
  return (
    <div className="w-full">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          onPostClick={onPostClick}
          highlightOptions={highlightOptions}
        />
      ))}
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
