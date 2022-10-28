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
import {
  firebaseLogin,
  getUser,
  getUsersBlockFacetFilters,
  User,
} from 'web/lib/firebase/users'
import { Col } from 'web/components/layout/col'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
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
import { Button } from 'web/components/buttons/button'
import { listAllCommentsOnGroup } from 'web/lib/firebase/comments'
import { GroupComment } from 'common/comment'
import { getPost, listPosts } from 'web/lib/firebase/posts'
import { Post } from 'common/post'
import { usePost, usePosts } from 'web/hooks/use-post'
import { useAdmin } from 'web/hooks/use-admin'
import { track } from 'web/lib/service/analytics'
import { ArrowLeftIcon } from '@heroicons/react/solid'
import { SelectMarketsModal } from 'web/components/contract-select-modal'
import { BETTORS } from 'common/user'
import { Page } from 'web/components/layout/page'
import { Tabs } from 'web/components/layout/tabs'
import { GroupAbout } from 'web/components/groups/group-about'

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
  'about',
  'leaderboards',
] as const

export default function GroupPage(props: {
  group: Group | null
  memberIds: string[]
  creator: User | null
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
  const tabIndex = ['markets', 'about', 'leaderboards'].indexOf(
    page === 'about' ? 'about' : page ?? 'markets'
  )

  const group = useGroup(props.group?.id) ?? props.group
  const aboutPost = usePost(props.aboutPost?.id) ?? props.aboutPost

  let groupPosts = usePosts(group?.postIds ?? []) ?? posts

  if (aboutPost != null) {
    groupPosts = [aboutPost, ...groupPosts]
  }

  const user = useUser()
  const privateUser = usePrivateUser()
  const isAdmin = useAdmin()
  const memberIds = useMemberIds(group?.id ?? null) ?? props.memberIds

  useSaveReferral(user, {
    defaultReferrerUsername: creator?.username,
    groupId: group?.id,
  })

  if (group === null || !groupSubpages.includes(page) || slugs[2] || !creator) {
    return <Custom404 />
  }
  const isCreator = user && group && user.id === group.creatorId
  const isMember = user ? memberIds.includes(user.id) : undefined
  const maxLeaderboardSize = 50

  return (
    <Page logoSubheading={group.name}>
      <SEO
        title={group.name}
        description={`Created by ${creator.name}. ${group.about}`}
        url={groupPath(group.slug)}
      />
      <TopGroupNavBar group={group} isMember={isMember} />
      <div className="relative hidden justify-self-end md:flex">
        <div className="absolute right-0 top-0 z-10">
          <JoinOrAddQuestionsButtons
            group={group}
            user={user}
            isMember={!!isMember}
          />
        </div>
      </div>
      <div className={'relative p-1 pt-0'}>
        {/* TODO: Switching tabs should also update the group path */}
        <Tabs
          className={'mb-2'}
          tabs={[
            {
              title: 'Markets',
              content: (
                <ContractSearch
                  headerClassName="md:sticky"
                  user={user}
                  defaultSort={'score'}
                  defaultFilter={suggestedFilter}
                  additionalFilter={{
                    groupSlug: group.slug,
                    facetFilters: getUsersBlockFacetFilters(privateUser),
                  }}
                  persistPrefix={`group-${group.slug}`}
                  includeProbSorts
                />
              ),
            },
            {
              title: 'About',
              content: (
                <GroupAbout
                  group={group}
                  posts={groupPosts}
                  isEditable={!!isCreator || isAdmin}
                  aboutPost={aboutPost}
                  creator={creator}
                  user={user}
                  memberIds={memberIds}
                />
              ),
            },
            {
              title: 'Leaderboards',
              content: (
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
              ),
            },
          ]}
          defaultIndex={tabIndex}
        />
      </div>
    </Page>
  )
}

export function TopGroupNavBar(props: {
  group: Group
  isMember: boolean | undefined
}) {
  const { group, isMember } = props
  const user = useUser()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 md:hidden lg:col-span-12">
      <Row className="items-center justify-between gap-2 bg-white px-2">
        <Link
          href="/"
          className="py-4 px-2 text-indigo-700 hover:text-gray-500"
        >
          <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
        </Link>
        <h1 className="truncate text-lg font-medium text-indigo-700">
          {props.group.name}
        </h1>
        <JoinOrAddQuestionsButtons
          group={group}
          user={user}
          isMember={isMember}
        />
      </Row>
    </header>
  )
}

function JoinOrAddQuestionsButtons(props: {
  group: Group
  user: User | null | undefined
  isMember: boolean | undefined
}) {
  const { group, user, isMember } = props

  if (user === undefined || isMember === undefined) return <div />

  return user && isMember ? (
    <AddContractButton group={group} user={user} />
  ) : group.anyoneCanJoin ? (
    <JoinGroupButton group={group} user={user} />
  ) : (
    <div />
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
      <Button
        className="whitespace-nowrap"
        size="md"
        color="indigo"
        onClick={() => setOpen(true)}
      >
        Add markets
      </Button>

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
      <Button onClick={follow} color="blue">
        Follow
      </Button>
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
