import { CATEGORY_KEY, Group } from 'common/group'
import { User } from 'common/user'
import { isEqual, uniqBy } from 'lodash'
import { useEffect, useRef, useState } from 'react'
import { GroupsList } from 'web/components/groups/groups-list'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { inMemoryStore } from 'web/hooks/use-persistent-state'
import { getMyGroupRoles, searchGroups } from 'web/lib/supabase/groups'
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
import { useEvent } from 'web/hooks/use-event'
import { useSafeLayoutEffect } from 'web/hooks/use-safe-layout-effect'
import { useGroupFromRouter } from 'web/hooks/use-group-from-router'
export type GroupState = {
  groups: Group[] | undefined
  fuzzyGroupOffset: number
  shouldLoadMore: boolean
}

const INITIAL_STATE = {
  groups: undefined,
  fuzzyGroupOffset: 0,
  shouldLoadMore: true,
}

const GROUPS_PER_PAGE = 100
export const TOPIC_SEARCH_TERM = 'cs'

export default function GroupSearch(props: { persistPrefix: string }) {
  const { persistPrefix } = props
  const user = useUser()
  const yourGroupIds = useMemberGroupIds(user?.id)
  const [state, setState] = usePersistentInMemoryState<GroupState>(
    INITIAL_STATE,
    `${persistPrefix}-supabase-search`
  )
  const isMobile = useIsMobile()

  const router = useRouter()
  const { q } = router.query
  // Allow users to browse without keyboard popping up on mobile.
  const autoFocus = !isMobile && !q

  const shouldFilterDestiny = useShouldBlockDestiny(user?.id)

  const searchTerm = useRef<string>('')
  const searchTermStore = inMemoryStore<string>()

  const trendingGroups = useTrendingGroupsSearchResults(
    '',
    100,
    false
  ) as Group[]

  const [groupSearchTerm, setGroupSearchTerm] = usePersistentQueryState(
    TOPIC_SEARCH_TERM,
    ''
  )

  useSafeLayoutEffect(() => {
    const params = searchTermStore.get(`${persistPrefix}-params`)
    if (params !== undefined) {
      searchTerm.current = params
    }
  }, [])
  const [categorySlug, setCategorySlug] = usePersistentQueryState<string>(
    CATEGORY_KEY,
    ''
  )
  const [show, setShow] = useState(false)

  // Counts as loaded if you are on the page and a query finished or if you go back in history.
  const [hasLoadedQuery, setHasLoadedQuery] = usePersistentInMemoryState(
    false,
    `${persistPrefix}-group-search-has-loaded`
  )
  const unshiftGroups = useEvent(async (freshState: GroupState) => {
    if (searchTerm.current == null) {
      return false
    }
    if (searchTerm.current == '' && trendingGroups) {
      setState({
        fuzzyGroupOffset: 0,
        groups: trendingGroups,
        shouldLoadMore: false,
      })
      return
    }
    const res = await searchGroups({
      state: freshState,
      term: searchTerm.current,
      offset: 0,
      limit: GROUPS_PER_PAGE,
    })
    const newGroups: Group[] = res.data
    setState((prev) => ({
      fuzzyGroupOffset: 0,
      groups: newGroups.concat(trendingGroups ?? prev.groups ?? []),
      shouldLoadMore: false,
    }))
  })
  const onSearchTermChanged = useRef((params: string) => {
    if (!isEqual(searchTerm.current, params) || !hasLoadedQuery) {
      setHasLoadedQuery(true)
      if (persistPrefix) {
        searchTermStore.set(`${persistPrefix}-params`, params)
      }
      searchTerm.current = params
      const freshState = {
        ...INITIAL_STATE,
      }
      unshiftGroups(freshState)
    }
  }).current

  useEffect(() => {
    onSearchTermChanged(groupSearchTerm)
  }, [groupSearchTerm])

  useEffect(() => {
    if (trendingGroups.length)
      setState((prev) => ({
        ...prev,
        groups: (prev.groups ?? []).concat(trendingGroups),
      }))
  }, [trendingGroups.length])
  const { groups: myGroups } = useGroupRoles(user)
  const privateUser = usePrivateUser()

  const resultGroups = state.groups

  const groups =
    groupSearchTerm || !resultGroups
      ? uniqBy(resultGroups, (g) => removeEmojis(g.name).toLowerCase())
      : combineGroupsByImportance(resultGroups, myGroups)
  const categoryFromRouter = useGroupFromRouter(categorySlug, groups)

  useEffect(() => {
    const { isReady } = router
    if (isReady && !router.query[TOPIC_SEARCH_TERM]) {
      setGroupSearchTerm('')
    } else if (isReady && groupSearchTerm && !categorySlug) {
      setShow(true)
    }
  }, [groupSearchTerm])

  const menuButton = show ? null : (
    <Button
      color={'gray-outline'}
      size={'md'}
      className={'mx-2'}
      onClick={() => setShow(!show)}
    >
      <MenuIcon className="mr-1 h-5 w-5" />
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
          showCategories={false}
          menuButton={menuButton}
          hideAvatar={show}
        />
      </Col>
      {/*<Input*/}
      {/*  type="text"*/}
      {/*  inputMode="search"*/}
      {/*  value={inputTerm}*/}
      {/*  onChange={(e) => setInputTerm(e.target.value)}*/}
      {/*  placeholder="Search categories"*/}
      {/*  className={'m-2'}*/}
      {/*  inputSize={'sm'}*/}
      {/*/>*/}
      <GroupsList
        key={'groups' + groups.length}
        groups={buildArray(
          categoryFromRouter &&
            !groups
              .map((g) => g.slug)
              .slice(0, 10)
              .includes(categoryFromRouter.slug) &&
            (categoryFromRouter as Group),
          groups
        )}
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
// const search = useEvent(
//   async (currentState: GroupState, freshQuery?: boolean) => {
//     if (searchTerm.current == null) {
//       return false
//     }
//     const id = ++requestId.current
//     const offset = freshQuery
//       ? 0
//       : currentState.groups
//       ? currentState.groups.length
//       : 0
//
//     if (freshQuery || currentState.shouldLoadMore) {
//       const results = await searchGroups({
//         state: currentState,
//         term: searchTerm.current,
//         offset: offset,
//         limit: GROUPS_PER_PAGE,
//       })
//
//       if (id === requestId.current) {
//         const newGroups: Group[] = results.data
//         const freshGroups = freshQuery
//           ? newGroups
//           : [
//               ...(currentState.groups ? currentState.groups : []),
//               ...newGroups,
//             ]
//
//         const newFuzzyGroupOffset =
//           results.fuzzyOffset + currentState.fuzzyGroupOffset
//
//         const shouldLoadMore = newGroups.length === GROUPS_PER_PAGE
//
//         setState({
//           fuzzyGroupOffset: newFuzzyGroupOffset,
//           groups: freshGroups,
//           shouldLoadMore,
//         })
//
//         return shouldLoadMore
//       }
//     }
//     return false
//   }
// )
