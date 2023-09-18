import { CATEGORY_KEY, Group } from 'common/group'
import { User } from 'common/user'
import { uniqBy } from 'lodash'
import { useEffect, useState } from 'react'
import { GroupsList } from 'web/components/groups/groups-list'
import { getMyGroupRoles } from 'web/lib/supabase/groups'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'
import { Col } from 'web/components/layout/col'
import { removeEmojis } from 'common/topics'
import {
  usePrivateUser,
  useShouldBlockDestiny,
  useUser,
} from 'web/hooks/use-user'
import { useMemberGroupIds } from 'web/hooks/use-group-supabase'
import { Row } from 'web/components/layout/row'
import { buildArray } from 'common/util/array'
import {
  BLOCKED_BY_DEFAULT_GROUP_SLUGS,
  DESTINY_GROUP_SLUGS,
} from 'common/envs/constants'
import { SupabaseContractSearch } from 'web/components/contracts-search'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useRouter } from 'next/router'
import { Button } from 'web/components/buttons/button'
import { MenuIcon } from '@heroicons/react/outline'
import { useTrendingGroupsSearchResults } from 'web/components/search/query-groups'
import { useGroupFromRouter } from 'web/hooks/use-group-from-router'
export type GroupState = {
  groups: Group[] | undefined
  fuzzyGroupOffset: number
  shouldLoadMore: boolean
}

const GROUPS_PER_PAGE = 100
export const SHOW_TOPICS_TERM = 'show-topics'

export default function TopicSidebar() {
  const user = useUser()
  const yourGroupIds = useMemberGroupIds(user?.id)
  const isMobile = useIsMobile()
  const router = useRouter()
  const { q } = router.query
  // Allow users to browse without keyboard popping up on mobile.
  const autoFocus = !isMobile && !q

  const shouldFilterDestiny = useShouldBlockDestiny(user?.id)

  const trendingGroups = useTrendingGroupsSearchResults(
    '',
    100,
    false,
    'home-page-trending-topics'
  ) as Group[]

  const [categorySlug, setCategorySlug] = usePersistentQueryState<string>(
    CATEGORY_KEY,
    ''
  )
  const [show, setShow] = useState<boolean>(false)

  const { groups: myTopics } = useGroupRoles(user)
  const privateUser = usePrivateUser()

  const topicsByImportance = (
    categorySlug || !trendingGroups
      ? uniqBy(trendingGroups, (g) => removeEmojis(g.name).toLowerCase())
      : combineGroupsByImportance(trendingGroups, myTopics)
  ).filter((g) => !privateUser?.blockedGroupSlugs.includes(g.slug))
  const topicFromRouter = useGroupFromRouter(categorySlug, topicsByImportance)
  const topics = buildArray(
    topicFromRouter &&
      !topicsByImportance
        .map((g) => g.slug)
        .slice(0, 10)
        .includes(topicFromRouter.slug) &&
      (topicFromRouter as Group),
    topicsByImportance
  )

  const menuButton = show ? null : (
    <Button
      color={'gray-outline'}
      size={'md'}
      className={'ml-1 w-[8rem] sm:ml-2 md:w-[10.5rem]'}
      onClick={() => setShow(!show)}
    >
      <MenuIcon className="mr-2 h-5 w-5" />
      Topics
    </Button>
  )
  return (
    <Row className={'mt-2 pl-2 sm:mt-0'}>
      <Col
        className={
          'scrollbar-hide relative max-h-[calc(100vh-4rem)] min-h-[35rem] w-full overflow-y-auto overflow-x-visible lg:max-h-[calc(100vh-5.25rem)]'
        }
      >
        <SupabaseContractSearch
          persistPrefix="search"
          autoFocus={autoFocus}
          additionalFilter={{
            excludeContractIds: privateUser?.blockedContractIds,
            excludeGroupSlugs: buildArray(
              privateUser?.blockedGroupSlugs,
              shouldFilterDestiny &&
                !DESTINY_GROUP_SLUGS.includes(categorySlug) &&
                DESTINY_GROUP_SLUGS,
              !user && BLOCKED_BY_DEFAULT_GROUP_SLUGS
            ),
            excludeUserIds: privateUser?.blockedUserIds,
            groupId: categorySlug !== '' ? categorySlug : undefined,
          }}
          useUrlParams
          isWholePage
          headerClassName={'bg-canvas-0'}
          menuButton={menuButton}
          hideAvatar={show}
        />
      </Col>
      <GroupsList
        key={'groups' + topics.length}
        groups={topics}
        currentCategorySlug={categorySlug}
        setCurrentCategory={setCategorySlug}
        privateUser={privateUser}
        user={user}
        yourGroupIds={yourGroupIds}
        show={show}
        setShow={setShow}
      />
    </Row>
  )
}

const combineGroupsByImportance = (
  resultGroups: Group[],
  myGroups: Group[]
) => {
  const combined = [
    ...resultGroups.slice(0, GROUPS_PER_PAGE),
    ...myGroups,
    ...resultGroups.slice(GROUPS_PER_PAGE - 1),
  ]

  return uniqBy(combined, (g) => removeEmojis(g.name).toLowerCase())
}

const useGroupRoles = (user: User | undefined | null) => {
  const [roles, setRoles] =
    useState<Awaited<ReturnType<typeof getMyGroupRoles>>>()

  useEffect(() => {
    if (user)
      getMyGroupRoles(user.id).then((roles) =>
        setRoles(
          roles?.sort(
            (a, b) =>
              (b.role === 'admin' ? 2 : b.role === 'moderator' ? 1 : 0) -
              (a.role === 'admin' ? 2 : a.role === 'moderator' ? 1 : 0)
          )
        )
      )
  }, [])

  const groups: Group[] =
    roles?.map((g) => ({
      id: g.group_id!,
      name: g.group_name!,
      slug: g.group_slug!,
      privacyStatus: g.privacy_status as any,
      totalMembers: g.total_members!,
      creatorId: g.creator_id!,
      createdTime: g.createdtime!,
      postIds: [],
      importanceScore: 0,
    })) ?? []

  return { roles, groups }
}
