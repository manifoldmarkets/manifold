import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import { Group, groupPath } from 'common/group'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Leaderboard } from 'web/components/leaderboard'
import { SEO } from 'web/components/SEO'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { User } from 'web/lib/firebase/users'
import { Custom404Content } from '../../404'
import { ArrowLeftIcon, PlusCircleIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { ENV_CONFIG, HOUSE_BOT_USERNAME } from 'common/envs/constants'
import { BETTORS } from 'common/user'
import { TopicAboutSection } from 'web/components/topics/topic-about-section'
import BannerImage from 'web/components/topics/topic-banner-image'
import { TopicOptions } from 'web/components/topics/topic-options'
import { Page } from 'web/components/layout/page'
import { ControlledTabs } from 'web/components/layout/tabs'
import { SupabaseSearch } from 'web/components/supabase-search'
import { useAdmin } from 'web/hooks/use-admin'
import { useGroupFromSlug } from 'web/hooks/use-group-supabase'
import { useIntersection } from 'web/hooks/use-intersection'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { getGroupFromSlug } from 'web/lib/supabase/group'
// import { getPostsByGroup } from 'web/lib/supabase/post'
import { useUserById } from 'web/hooks/use-user-supabase'
import { EditableTopicName } from 'web/components/topics/editable-topic-name'
import { FollowOrUnfollowTopicButton } from 'web/components/topics/topics-button'
import { getDisplayUsers } from 'web/lib/supabase/users'
import { getUserForStaticPropsById } from 'common/supabase/users'
import { db } from 'web/lib/supabase/db'
import { Button } from 'web/components/buttons/button'
import { AddContractToGroupModal } from 'web/components/topics/add-contract-to-group-modal'

const MAX_LEADERBOARD_SIZE = 50
const MEMBER_INDEX = 0
const MEMBER_INVITE_INDEX = 1
type MemberIndex = 0 | 1

type GroupParams = {
  group: Group | null
  creator: User | null
  topTraders: { user: User; score: number }[]
  topCreators: { user: User; score: number }[]
  // posts: Post[]
}

export async function getStaticProps(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params
  if (slugs.length > 2) {
    return {
      notFound: true,
    }
  }
  const groupSlug = slugs[0]
  const group = await getGroupFromSlug(groupSlug)
  if (!group) {
    return {
      notFound: true,
    }
  }

  const creator = await getUserForStaticPropsById(db, group.creatorId)
  const cachedTopTraderIds = group.cachedLeaderboard?.topTraders ?? []
  const cachedTopCreatorIds = group.cachedLeaderboard?.topCreators ?? []
  const topTraders = await toTopUsers(cachedTopTraderIds)
  const topCreators = await toTopUsers(cachedTopCreatorIds)

  // const posts = await getPostsByGroup(group.id)
  return {
    props: {
      group: group ?? null,
      creator: creator ?? null,
      topTraders: topTraders ?? [],
      topCreators: topCreators ?? [],
      // posts: posts ?? [],
    },
    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

const groupSubpages = ['questions', 'leaderboards']

export default function GroupPage(props: GroupParams) {
  const router = useRouter()
  const { slugs } = router.query as { slugs: string[] }
  const page = slugs?.[1]
  const rawIndex = groupSubpages.indexOf(page)
  const tabIndex = rawIndex === -1 ? 0 : rawIndex
  const [activeIndex, setActiveIndex] = useState(tabIndex)
  useEffect(() => {
    setActiveIndex(tabIndex)
  }, [tabIndex])

  const user = useUser()
  const isManifoldAdmin = useAdmin()
  const group = useGroupFromSlug(slugs[0]) ?? props?.group
  // const realtimeRole = useRealtimeRole(group?.id)
  const userRole = isManifoldAdmin ? 'admin' : '' // realtimeRole
  const isMobile = useIsMobile()
  const privateUser = usePrivateUser()
  const [writingNewAbout, setWritingNewAbout] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const bannerRef = useRef<HTMLDivElement | null>(null)
  const bannerVisible = useIntersection(bannerRef, '-120px', useRef(null))
  const creator = useUserById(group?.creatorId) ?? props?.creator
  const topTraders =
    useToTopUsers((group && group.cachedLeaderboard?.topTraders) ?? []) ??
    props?.topTraders ??
    []

  const topCreators =
    useToTopUsers((group && group.cachedLeaderboard?.topCreators) ?? []) ??
    props?.topCreators ??
    []

  const [openMemberModal, setOpenMemberModal] = useState(false)
  const [defaultMemberTab, setDefaultMemberTab] =
    useState<MemberIndex>(MEMBER_INDEX)
  const [showAddContract, setShowAddContract] = useState(false)

  useSaveReferral(user, {
    defaultReferrerUsername: creator?.username,
    // groupId: group?.id,
  })

  if (group === undefined) {
    return <></>
  }
  if (group === null || slugs[2]) {
    return <Custom404Content />
  }

  const onMemberClick = () => {
    setDefaultMemberTab(MEMBER_INDEX)
    setOpenMemberModal(true)
  }

  const onAddMemberClick = () => {
    setDefaultMemberTab(MEMBER_INVITE_INDEX)
    setOpenMemberModal(true)
  }

  const groupUrl = `https://${ENV_CONFIG.domain}${groupPath(group.slug)}`
  return (
    <Page
      trackPageView={'category slug page'}
      trackPageProps={{ slug: props?.group?.slug }}
      key={`group-${slugs[0]}`}
    >
      <SEO
        title={group.name}
        description={`Manifold ${group.privacyStatus} category with ${group.totalMembers} followers`}
        url={groupPath(group.slug)}
        image={group.bannerUrl}
      />
      <Button
        color={'gray-white'}
        size={isMobile ? 'sm' : 'md'}
        className="fixed bottom-16 right-2 z-50 lg:bottom-4 lg:right-[17.5%] xl:right-[calc(50%-26rem)]"
        onClick={() => setShowAddContract(true)}
      >
        <Row>
          <PlusCircleIcon className={'mr-1 h-5 w-5'} />
          Add questions
        </Row>
      </Button>
      {showAddContract && user && (
        <AddContractToGroupModal
          group={group}
          open={showAddContract}
          setOpen={setShowAddContract}
          user={user}
        />
      )}
      {isMobile && (
        <TopGroupNavBar
          group={group}
          groupUrl={groupUrl}
          user={user}
          canEdit={userRole === 'admin'}
          setWritingNewAbout={setWritingNewAbout}
          bannerVisible={bannerVisible}
          onAddMemberClick={onAddMemberClick}
          setEditingName={setEditingName}
        />
      )}
      <div className="relative">
        {isManifoldAdmin && (
          <div className="pointer-events-none absolute right-0 top-0 z-50 rounded bg-red-200/80 px-4 py-2 text-lg font-bold text-red-500">
            ADMIN
          </div>
        )}
        <Col className="bg-canvas-0 w-full bg-opacity-90 px-4">
          <Row className="my-2 hidden w-full justify-between gap-1 sm:flex">
            <EditableTopicName
              group={group}
              isEditing={editingName}
              onFinishEditing={(changed) => {
                setEditingName(false)
                if (changed) router.reload()
              }}
            />
            <Col>
              <Row>
                {user?.id != group.creatorId && (
                  <FollowOrUnfollowTopicButton
                    group={group}
                    isMember
                    user={user}
                  />
                )}
                <TopicOptions
                  group={group}
                  user={user}
                  isMember
                  // canEdit={userRole === 'admin'}
                  // setWritingNewAbout={setWritingNewAbout}
                  unfollow={onAddMemberClick}
                  // onAddMemberClick={onAddMemberClick}
                  // setEditingName={setEditingName}
                />
              </Row>
            </Col>
          </Row>
        </Col>
        {editingName && (
          <div className={'ml-1 sm:hidden'}>
            <EditableTopicName
              group={group}
              isEditing={editingName}
              onFinishEditing={(changed) => {
                setEditingName(false)
                if (changed) router.reload()
              }}
            />
          </div>
        )}
        <div ref={bannerRef}>
          <BannerImage
            group={group}
            user={user}
            canEdit={userRole === 'admin'}
            key={group.id}
          />
        </div>
      </div>

      <TopicAboutSection
        group={group}
        canEdit={userRole === 'admin'}
        writingNewAbout={writingNewAbout}
        setWritingNewAbout={setWritingNewAbout}
      />
      <div className={'relative p-1 pt-0'}>
        <ControlledTabs
          activeIndex={activeIndex}
          onClick={(title, index) => {
            // concatenates the group slug with the subpage slug
            const path = `/group/${group.slug}/${groupSubpages[index] ?? ''}`
            router.push(path, undefined, { shallow: true })
            setActiveIndex(index)
          }}
          className={'mb-2'}
          tabs={[
            {
              title: 'Questions',
              content: (
                <SupabaseSearch
                  defaultFilter="all"
                  additionalFilter={{
                    excludeContractIds: privateUser?.blockedContractIds,
                    excludeGroupSlugs: privateUser?.blockedGroupSlugs ?? [],
                    excludeUserIds: privateUser?.blockedUserIds,
                  }}
                  topics={[group]}
                  persistPrefix={`group-${group.slug}`}
                  useUrlParams
                  contractsOnly
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
        <Row
          className={
            'absolute right-2 top-1 w-full items-end justify-end sm:hidden'
          }
        >
          {user?.id != group.creatorId && (
            <FollowOrUnfollowTopicButton group={group} isMember user={user} />
          )}
        </Row>
      </div>
    </Page>
  )
}

function TopGroupNavBar(props: {
  group: Group
  groupUrl: string
  user: User | undefined | null
  canEdit: boolean
  setWritingNewAbout: (writingNewAbout: boolean) => void
  setEditingName: (editingName: boolean) => void
  bannerVisible: boolean
  onAddMemberClick: () => void
}) {
  const {
    group,
    user,
    canEdit,
    setWritingNewAbout,
    bannerVisible,
    onAddMemberClick,
    setEditingName,
  } = props

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
            className="hover:text-ink-500 text-primary-700 px-2 py-4"
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
            <TopicOptions
              group={group}
              user={user}
              isMember={canEdit}
              // canEdit={canEdit}
              // setWritingNewAbout={setWritingNewAbout}
              unfollow={onAddMemberClick}
              // onAddMemberClick={onAddMemberClick}
              // setEditingName={setEditingName}
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
  const userData = await getDisplayUsers(cachedUserIds.map((u) => u.userId))
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
