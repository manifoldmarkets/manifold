import Router, { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'

import { Group, groupPath } from 'common/group'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Leaderboard } from 'web/components/leaderboard'
import { SEO } from 'web/components/SEO'
import { useGroup } from 'web/hooks/use-group'
import { fromPropz, usePropz } from 'web/hooks/use-propz'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { Contract } from 'web/lib/firebase/contracts'
import { getGroupBySlug } from 'web/lib/firebase/groups'
import {
  getUser,
  getUsersBlockFacetFilters,
  User,
} from 'web/lib/firebase/users'
import Custom404 from '../../404'

import {
  ArrowLeftIcon,
  CheckCircleIcon,
  PlusCircleIcon,
  XCircleIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { GroupComment } from 'common/comment'
import { ENV_CONFIG, HOUSE_BOT_USERNAME } from 'common/envs/constants'
import { Post } from 'common/post'
import { BETTORS, PrivateUser } from 'common/user'
import toast from 'react-hot-toast'
import { IconButton } from 'web/components/buttons/button'
import { ContractSearch } from 'web/components/contract-search'
import { AddMarketToGroupModal } from 'web/components/groups/add-market-modal'
import { GroupAboutSection } from 'web/components/groups/group-about-section'
import BannerImage from 'web/components/groups/group-banner-image'
import { groupRoleType } from 'web/components/groups/group-member-modal'
import { GroupOptions } from 'web/components/groups/group-options'
import GroupPrivacyStatusWidget, {
  GroupMembersWidget,
} from 'web/components/groups/group-page-items'
import { GroupPostSection } from 'web/components/groups/group-post-section'
import { JoinOrLeaveGroupButton } from 'web/components/groups/groups-button'
import { Page } from 'web/components/layout/page'
import { ControlledTabs } from 'web/components/layout/tabs'
import { useAdmin } from 'web/hooks/use-admin'
import { useRealtimeRole } from 'web/hooks/use-group-supabase'
import { useIntersection } from 'web/hooks/use-intersection'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { usePost, usePosts } from 'web/hooks/use-post'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { addContractToGroup } from 'web/lib/firebase/api'
import { listAllCommentsOnGroup } from 'web/lib/firebase/comments'
import { getPost, listPosts } from 'web/lib/firebase/posts'
import {
  AddContractButton,
  AddPrivateContractButton,
} from 'web/components/groups/add-contract-to-group-button'

export const groupButtonClass = 'text-gray-700 hover:text-gray-800'
export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const group = await getGroupBySlug(slugs[0])
  const creatorPromise = group ? getUser(group.creatorId) : null

  const messages = group && (await listAllCommentsOnGroup(group.id))

  const cachedTopTraderIds =
    (group && group.cachedLeaderboard?.topTraders) ?? []
  const cachedTopCreatorIds =
    (group && group.cachedLeaderboard?.topCreators) ?? []
  const topTraders = await toTopUsers(cachedTopTraderIds)

  const topCreators = await toTopUsers(cachedTopCreatorIds)

  const creator = await creatorPromise

  const aboutPost = group?.aboutPostId ? await getPost(group.aboutPostId) : null
  const posts = ((group && (await listPosts(group.postIds))) ?? []).filter(
    (p) => p != null
  ) as Post[]
  return {
    props: {
      group,
      creator,
      topTraders,
      topCreators,
      messages,
      aboutPost,
      posts,
    },

    revalidate: 60, // regenerate after a minute
  }
}
export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}
const groupSubpages = [undefined, 'markets', 'about', 'leaderboards'] as const

export default function GroupPage(props: {
  group: Group | null
  memberIds: string[]
  creator: User | null
  topTraders: { user: User; score: number }[]
  topCreators: { user: User; score: number }[]
  messages: GroupComment[]
  suggestedFilter: 'open' | 'all'
  aboutPost: Post | null
  posts: Post[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    group: null,
    creator: null,
    topTraders: [],
    topCreators: [],
    messages: [],
    aboutPost: null,
    posts: [],
  }
  const { creator, topTraders, topCreators, posts } = props

  const router = useRouter()

  const { slugs } = router.query as { slugs: string[] }
  const page = slugs?.[1] as typeof groupSubpages[number]
  const tabIndex = ['markets', 'about', 'leaderboards'].indexOf(
    page === 'about' ? 'about' : page ?? 'markets'
  )

  const group = useGroup(props.group?.id) ?? props.group
  const aboutPost = usePost(group?.aboutPostId) ?? props.aboutPost

  let groupPosts = usePosts(group?.postIds ?? []) ?? posts

  if (aboutPost != null) {
    groupPosts = [aboutPost, ...groupPosts]
  }

  const user = useUser()
  const privateUser = usePrivateUser()
  const userRole = useRealtimeRole(group?.id)
  const isManifoldAdmin = useAdmin()
  const [activeIndex, setActiveIndex] = useState(tabIndex)
  useEffect(() => {
    setActiveIndex(tabIndex)
  }, [tabIndex])

  useSaveReferral(user, {
    defaultReferrerUsername: creator?.username,
    groupId: group?.id,
  })

  const [writingNewAbout, setWritingNewAbout] = useState(false)
  const bannerRef = useRef<HTMLDivElement | null>(null)
  const bannerVisible = useIntersection(bannerRef, '-120px', useRef(null))
  const isMobile = useIsMobile()
  if (group === null || !groupSubpages.includes(page) || slugs[2] || !creator) {
    return <Custom404 />
  }
  const maxLeaderboardSize = 50
  const groupUrl = `https://${ENV_CONFIG.domain}${groupPath(group.slug)}`

  const chatEmbed = <ChatEmbed group={group} />
  return (
    <Page rightSidebar={chatEmbed} touchesTop={true}>
      <SEO
        title={group.name}
        description={
          group.about ||
          `Manifold ${group.privacyStatus} group with ${group.totalMembers} members`
        }
        url={groupPath(group.slug)}
        image={group.bannerUrl}
      />
      {user && isManifoldAdmin && group.privacyStatus != 'private' && (
        <AddContractButton
          group={group}
          user={user}
          userRole={'admin'}
          className="fixed bottom-16 right-2 z-50 fill-white lg:right-[17.5%] lg:bottom-4 xl:right-[calc(50%-19rem)]"
        />
      )}
      {user &&
        !isManifoldAdmin &&
        (group.privacyStatus == 'public' ||
          (group.privacyStatus == 'curated' &&
            (userRole == 'admin' || userRole == 'moderator'))) && (
          <AddContractButton
            group={group}
            user={user}
            userRole={userRole ?? undefined}
            className="fixed bottom-16 right-2 z-50 fill-white lg:right-[17.5%] lg:bottom-4 xl:right-[calc(50%-19rem)]"
          />
        )}
      {user && group.privacyStatus == 'private' && (
        <AddPrivateContractButton
          group={group}
          user={user}
          userRole={'admin'}
          className="fixed bottom-16 right-2 z-50 fill-white lg:right-[17.5%] lg:bottom-4 xl:right-[calc(50%-19rem)]"
        />
      )}
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
        <Col className="absolute bottom-0 w-full bg-white bg-opacity-80 px-4">
          <Row className="mt-4 mb-2 w-full justify-between gap-1">
            <div className="text-2xl font-normal text-gray-900 sm:text-3xl">
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
                    userRole: isManifoldAdmin ? 'admin' : userRole,
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
                  <div className="mb-4 text-gray-500">
                    Updated every 15 minutes
                  </div>
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
                      header="Number of traders"
                      maxToShow={maxLeaderboardSize}
                      noFormatting={true}
                    />
                  </div>
                </Col>
              ),
            },
          ]}
        />
      </div>
    </Page>
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
    <header className="sticky top-0 z-50 w-full border-b border-gray-200">
      <Row className="items-center justify-between gap-2 bg-white px-2">
        <div className="flex flex-1">
          <button
            className="py-4 px-2 text-indigo-700 hover:text-gray-500"
            onClick={() => router.back()}
          >
            <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <h1
          className={clsx(
            'truncate text-lg font-medium text-indigo-700 transition-all duration-500',
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

// For now, just embed the DestinyGG chat embed on their group page
function ChatEmbed(props: { group: Group }) {
  const { group } = props
  const destinyGroupId = 'W2ES30fRo6CCbPNwMTTj'
  if (group.id === destinyGroupId) {
    return (
      <div className="h-[90vh]">
        <iframe
          src="https://www.destiny.gg/embed/chat"
          width="100%"
          height="100%"
          frameBorder="0"
          scrolling="no"
          allowFullScreen
        />
      </div>
    )
  }
  return null
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
