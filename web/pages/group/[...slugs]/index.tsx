import Router, { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'

import { Group, groupPath, PrivacyStatusType } from 'common/group'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Leaderboard } from 'web/components/leaderboard'
import { SEO } from 'web/components/SEO'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { getUsersBlockFacetFilters, User } from 'web/lib/firebase/users'
import { Custom404Content } from '../../404'

import { ArrowLeftIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { GroupComment } from 'common/comment'
import { ENV_CONFIG, HOUSE_BOT_USERNAME } from 'common/envs/constants'
import { Post } from 'common/post'
import { BETTORS, PrivateUser } from 'common/user'
import { ContractSearch } from 'web/components/contract-search'
import { AddContractButton } from 'web/components/groups/add-contract-to-group-button'
import { GroupAboutSection } from 'web/components/groups/group-about-section'
import BannerImage from 'web/components/groups/group-banner-image'
import { GroupOptions } from 'web/components/groups/group-options'
import GroupPrivacyStatusWidget, {
  GroupMembersWidget,
} from 'web/components/groups/group-page-items'
import { GroupPostSection } from 'web/components/groups/group-post-section'
import { JoinOrLeaveGroupButton } from 'web/components/groups/groups-button'
import { PrivateGroupPage } from 'web/components/groups/private-group'
import { Page } from 'web/components/layout/page'
import { ControlledTabs } from 'web/components/layout/tabs'
import { useAdmin } from 'web/hooks/use-admin'
import {
  useGroupCreator,
  useRealtimeGroup,
  useRealtimeRole,
} from 'web/hooks/use-group-supabase'
import { useIntersection } from 'web/hooks/use-intersection'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { usePosts } from 'web/hooks/use-post'
import { useRealtimePost } from 'web/hooks/use-post-supabase'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { listPosts } from 'web/lib/firebase/posts'
import { getGroupFromSlug, getGroupPrivacyBySlug } from 'web/lib/supabase/group'
import { getPost } from 'web/lib/supabase/post'
import { getUser, getUsers } from 'web/lib/supabase/user'

export const groupButtonClass = 'text-ink-700 hover:text-ink-800'
const MAX_LEADERBOARD_SIZE = 50

type GroupParams = {
  group: Group | null
  creator: User | null
  topTraders: { user: User; score: number }[]
  topCreators: { user: User; score: number }[]
  messages: GroupComment[] | null
  aboutPost: Post | null
  posts: Post[]
}

export async function getStaticProps(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params
  const groupSlug = slugs[0]
  const groupPrivacy = await getGroupPrivacyBySlug(groupSlug)
  if (groupPrivacy === 'private') {
    return {
      props: {
        groupPrivacy,
        slugs,
      },
    }
  } else {
    const group = await getGroupFromSlug(slugs[0])
    const creatorPromise = group ? getUser(group.creatorId) : null
    const cachedTopTraderIds =
      (group && group.cachedLeaderboard?.topTraders) ?? []
    const cachedTopCreatorIds =
      (group && group.cachedLeaderboard?.topCreators) ?? []
    const topTraders = await toTopUsers(cachedTopTraderIds)
    const topCreators = await toTopUsers(cachedTopCreatorIds)
    const creator = await creatorPromise
    const aboutPost = group?.aboutPostId
      ? await getPost(group.aboutPostId)
      : null

    const posts = ((group && (await listPosts(group.postIds))) ?? []).filter(
      (p) => p != null
    ) as Post[]
    return {
      props: {
        groupPrivacy,
        slugs,
        groupParams: {
          group: group ?? null,
          creator: creator ?? null,
          topTraders: topTraders ?? [],
          topCreators: topCreators ?? [],
          aboutPost: aboutPost ?? null,
          posts: posts ?? [],
        },
        revalidate: 60, // regenerate after a minute
      },
    }
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}
const groupSubpages = [undefined, 'markets', 'about', 'leaderboards'] as const

export default function GroupPage(props: {
  groupPrivacy: PrivacyStatusType
  slugs: string[]
  groupParams?: GroupParams
}) {
  const { groupPrivacy, slugs, groupParams } = props
  return (
    <Page touchesTop={true}>
      {groupPrivacy == 'private' && <PrivateGroupPage slugs={slugs} />}
      {groupPrivacy != 'private' && groupParams && (
        <NonPrivateGroupPage groupParams={groupParams} />
      )}
    </Page>
  )
}

export function NonPrivateGroupPage(props: { groupParams: GroupParams }) {
  const { groupParams } = props
  const { group } = groupParams
  if (group === null) {
    return <Custom404Content />
  }
  return (
    <>
      <SEO
        title={group.name}
        description={
          group.about ||
          `Manifold ${group.privacyStatus} group with ${group.totalMembers} members`
        }
        url={groupPath(group.slug)}
        image={group.bannerUrl}
      />
      <GroupPageContent groupParams={groupParams} />
    </>
  )
}

export function GroupPageContent(props: { groupParams?: GroupParams }) {
  const { groupParams } = props

  const router = useRouter()
  const { slugs } = router.query as { slugs: string[] }
  const page = slugs?.[1] as typeof groupSubpages[number]
  const tabIndex = ['markets', 'about', 'leaderboards'].indexOf(
    page === 'about' ? 'about' : page ?? 'markets'
  )
  const [activeIndex, setActiveIndex] = useState(tabIndex)
  useEffect(() => {
    setActiveIndex(tabIndex)
  }, [tabIndex])

  const user = useUser()
  const isManifoldAdmin = useAdmin()
  const group = useRealtimeGroup(slugs[0]) ?? groupParams?.group
  const userRole = useRealtimeRole(group?.id)
  const isMobile = useIsMobile()
  const privateUser = usePrivateUser()
  const [writingNewAbout, setWritingNewAbout] = useState(false)
  const bannerRef = useRef<HTMLDivElement | null>(null)
  const bannerVisible = useIntersection(bannerRef, '-120px', useRef(null))
  const aboutPost =
    useRealtimePost(group?.aboutPostId) ?? groupParams?.aboutPost

  const groupPosts = usePosts(group?.postIds ?? []) ?? groupParams?.posts ?? []
  const creator = useGroupCreator(group) ?? groupParams?.creator

  const topTraders =
    useToTopUsers((group && group.cachedLeaderboard?.topTraders) ?? []) ??
    groupParams?.topTraders ??
    []

  const topCreators =
    useToTopUsers((group && group.cachedLeaderboard?.topCreators) ?? []) ??
    groupParams?.topCreators ??
    []

  useSaveReferral(user, {
    defaultReferrerUsername: creator?.username,
    groupId: group?.id,
  })

  if (group === undefined) {
    return <></>
  }
  if (group === null || !groupSubpages.includes(page) || slugs[2]) {
    return <Custom404Content />
  }
  const groupUrl = `https://${ENV_CONFIG.domain}${groupPath(group.slug)}`
  return (
    <>
      <AddContractButton
        group={group}
        user={user}
        userRole={userRole}
        className=" fixed bottom-16 right-2 z-50 lg:right-[17.5%] lg:bottom-4 xl:right-[calc(50%-26rem)]"
      />
      {isMobile && (
        <TopGroupNavBar
          group={group}
          isMember={!!userRole}
          groupUrl={groupUrl}
          privateUser={privateUser}
          canEdit={isManifoldAdmin || userRole === 'admin'}
          setWritingNewAbout={setWritingNewAbout}
          bannerVisible={bannerVisible}
        />
      )}
      <div className="relative">
        <div ref={bannerRef}>
          <BannerImage
            group={group}
            user={user}
            canEdit={isManifoldAdmin || userRole === 'admin'}
            key={group.id}
          />
        </div>
        <Col className="bg-canvas-0 absolute bottom-0 w-full bg-opacity-80 px-4">
          <Row className="mt-4 mb-2 w-full justify-between gap-1">
            <div className="text-ink-900 text-2xl font-normal sm:text-3xl">
              {group.name}
            </div>
            <Col className="justify-end">
              <Row className="items-center gap-2">
                {user?.id != group.creatorId && (
                  <JoinOrLeaveGroupButton
                    group={group}
                    isMember={!!userRole}
                    user={user}
                  />
                )}
                {!isMobile && (
                  <GroupOptions
                    group={group}
                    groupUrl={groupUrl}
                    privateUser={privateUser}
                    canEdit={isManifoldAdmin || userRole === 'admin'}
                    setWritingNewAbout={setWritingNewAbout}
                  />
                )}
              </Row>
            </Col>
          </Row>
          <Row className="mb-2 gap-4">
            <GroupMembersWidget
              group={group}
              canEdit={isManifoldAdmin || userRole === 'admin'}
            />
            <GroupPrivacyStatusWidget
              group={group}
              canEdit={isManifoldAdmin || userRole === 'admin'}
            />
          </Row>
        </Col>
      </div>

      <GroupAboutSection
        group={group}
        canEdit={isManifoldAdmin || userRole === 'admin'}
        post={aboutPost}
        writingNewAbout={writingNewAbout}
        setWritingNewAbout={setWritingNewAbout}
      />
      <div className={'relative p-1 pt-0'}>
        <ControlledTabs
          activeIndex={activeIndex}
          onClick={(title, index) => {
            // concatenates the group slug with the subpage slug
            const path = `/group/${group.slug}/${
              groupSubpages[index + 1] ?? ''
            }`
            Router.push(path, undefined, { shallow: true })
            setActiveIndex(index)
          }}
          className={'mb-2'}
          tabs={[
            {
              title: 'Markets',
              content: (
                <ContractSearch
                  defaultFilter="all"
                  additionalFilter={{
                    groupSlug: group.slug,
                    facetFilters: getUsersBlockFacetFilters(privateUser, true),
                  }}
                  persistPrefix={`group-${group.slug}`}
                  includeProbSorts
                  fromGroupProps={{
                    group: group,
                    userRole: isManifoldAdmin ? 'admin' : userRole ?? null,
                  }}
                />
              ),
            },
            {
              title: 'Posts',
              content: (
                <GroupPostSection
                  group={group}
                  posts={groupPosts}
                  canEdit={isManifoldAdmin || userRole === 'admin'}
                />
              ),
            },
            {
              title: 'Leaderboards',
              content: (
                <Col>
                  <div className="text-ink-500 mb-4">
                    Updated every 15 minutes
                  </div>
                  <div className="mt-4 flex flex-col gap-8 px-4 md:flex-row">
                    <GroupLeaderboard
                      topUsers={topTraders}
                      title={`🏅 Top ${BETTORS}`}
                      header="Profit"
                      maxToShow={MAX_LEADERBOARD_SIZE}
                    />
                    <GroupLeaderboard
                      topUsers={topCreators}
                      title="🏅 Top creators"
                      header="Number of traders"
                      maxToShow={MAX_LEADERBOARD_SIZE}
                      noFormatting={true}
                    />
                  </div>
                </Col>
              ),
            },
          ]}
        />
      </div>
    </>
  )
}

export function TopGroupNavBar(props: {
  group: Group
  isMember: boolean | undefined
  groupUrl: string
  privateUser: PrivateUser | undefined | null
  canEdit: boolean
  setWritingNewAbout: (writingNewAbout: boolean) => void
  bannerVisible: boolean
}) {
  const {
    group,
    isMember,
    groupUrl,
    privateUser,
    canEdit,
    setWritingNewAbout,
    bannerVisible,
  } = props
  const user = useUser()
  const transitionClass = clsx(
    'transition-opacity',
    bannerVisible ? 'opacity-0' : 'opacity-100'
  )
  const router = useRouter()
  return (
    <header className="border-ink-200 sticky top-0 z-50 w-full border-b">
      <Row className="bg-canvas-0 items-center justify-between gap-2 px-2">
        <div className="flex flex-1">
          <button
            className="hover:text-ink-500 text-primary-700 py-4 px-2"
            onClick={() => router.back()}
          >
            <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <h1
          className={clsx(
            'text-primary-700 truncate text-lg font-medium transition-all duration-500',
            transitionClass
          )}
        >
          {props.group.name}
        </h1>
        <div className="flex flex-1 justify-end">
          <Row className="items-center gap-2">
            <JoinOrLeaveGroupButton
              group={group}
              isMember={isMember}
              user={user}
              isMobile={true}
              disabled={bannerVisible}
              className={transitionClass}
            />
            <GroupOptions
              group={group}
              groupUrl={groupUrl}
              privateUser={privateUser}
              canEdit={canEdit}
              setWritingNewAbout={setWritingNewAbout}
            />
          </Row>
        </div>
      </Row>
    </header>
  )
}

function GroupLeaderboard(props: {
  topUsers: { user: User; score: number }[]
  title: string
  maxToShow: number
  header: string
  noFormatting?: boolean
}) {
  const { title, maxToShow, header, noFormatting } = props

  const topUsers = props.topUsers.filter(
    (u) => u.user.username !== HOUSE_BOT_USERNAME
  )
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
        {
          header,
          renderCell: (user) =>
            noFormatting
              ? scoresByUser[user.id]
              : formatMoney(scoresByUser[user.id]),
        },
      ]}
      maxToShow={maxToShow}
    />
  )
}

type UserStats = { user: User; score: number }

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
  cachedUserIds: { userId: string; score: number }[]
): UserStats[] | null {
  const [topUsers, setTopUsers] = useState<UserStats[]>([])
  useEffect(() => {
    toTopUsers(cachedUserIds).then((result) =>
      setTopUsers(result as UserStats[])
    )
  }, [cachedUserIds])
  return topUsers && topUsers.length > 0 ? topUsers : null
}
