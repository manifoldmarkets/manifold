import { Group } from 'common/group'
import { User } from 'common/user'
import { debounce, isEqual, uniqBy } from 'lodash'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GroupsList } from 'web/components/groups/groups-list'
import { useEvent } from 'web/hooks/use-event'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import {
  historyStore,
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { getMyGroupRoles, searchGroups } from 'web/lib/supabase/groups'
import { Col } from '../layout/col'
import { Spacer } from '../layout/spacer'
import { Input } from '../widgets/input'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'
import { LoadingIndicator } from '../widgets/loading-indicator'

const INITIAL_STATE = {
  groups: undefined,
  fuzzyGroupOffset: 0,
  shouldLoadMore: true,
}

const GROUPS_PER_PAGE = 50

export type GroupState = {
  groups: Group[] | undefined
  fuzzyGroupOffset: number
  shouldLoadMore: boolean
}

export default function GroupSearch(props: {
  persistPrefix: string
  yourGroupIds?: string[]
  user?: User | null
}) {
  const { persistPrefix, yourGroupIds = [], user } = props

  const performQuery = useEvent(
    async (currentState, freshQuery?: boolean) =>
      (await debouncedQuery(currentState, freshQuery)) ?? false
  )
  const [state, setState] = usePersistentInMemoryState<GroupState>(
    INITIAL_STATE,
    `${persistPrefix}-supabase-search`
  )

  const loadMoreGroups = () => performQuery(state)

  const searchTerm = useRef<string>('')
  const [inputTerm, setInputTerm] = usePersistentQueryState('search', '')
  const searchTermStore = inMemoryStore<string>()

  const requestId = useRef(0)
  const debouncedQuery = useCallback(
    debounce(
      async (currentState, freshQuery?: boolean) =>
        query(currentState, freshQuery),
      200
    ),
    []
  )

  const query = async (currentState: GroupState, freshQuery?: boolean) => {
    const id = ++requestId.current
    const offset = freshQuery
      ? 0
      : currentState.groups
      ? currentState.groups.length
      : 0

    if (freshQuery || currentState.shouldLoadMore) {
      const results = await searchGroups({
        state: currentState,
        term: searchTerm.current,
        offset: offset,
        limit: GROUPS_PER_PAGE,
      })

      if (id === requestId.current) {
        const newGroups: Group[] = results.data
        const freshGroups = freshQuery
          ? newGroups
          : [...(currentState.groups ? currentState.groups : []), ...newGroups]

        const newFuzzyGroupOffset =
          results.fuzzyOffset + currentState.fuzzyGroupOffset

        const shouldLoadMore = newGroups.length === GROUPS_PER_PAGE

        setState({
          fuzzyGroupOffset: newFuzzyGroupOffset,
          groups: freshGroups,
          shouldLoadMore,
        })
        if (freshQuery) window.scrollTo(0, 0)

        return shouldLoadMore
      }
    }
    return false
  }

  // Always do first query when loading search page, unless going back in history.
  const [firstQuery, setFirstQuery] = usePersistentState(true, {
    key: `${persistPrefix}-supabase-first-query`,
    store: historyStore(),
  })

  const onSearchTermChanged = useRef(
    debounce((term) => {
      if (!isEqual(searchTerm.current, term) || firstQuery) {
        setFirstQuery(false)
        if (persistPrefix) {
          searchTermStore.set(`${persistPrefix}-params`, term)
        }
        searchTerm.current = term
        performQuery(INITIAL_STATE, true)
      }
    }, 100)
  ).current

  useEffect(() => {
    onSearchTermChanged(inputTerm)
  }, [inputTerm])

  const { roles, groups: myGroups } = useGroupRoles(user)

  const resultGroups = state.groups

  const groups =
    inputTerm || !resultGroups
      ? resultGroups
      : combineGroupsByImportance(resultGroups, myGroups)

  return (
    <Col>
      <Input
        type="text"
        inputMode="search"
        value={inputTerm}
        onChange={(e) => setInputTerm(e.target.value)}
        placeholder="Search categories"
        className="w-full"
      />
      <Spacer h={1} />
      {!groups ? (
        <LoadingIndicator />
      ) : (
        <GroupsList
          key={'groups' + groups.length}
          groups={groups}
          loadMore={loadMoreGroups}
          yourGroupIds={yourGroupIds}
          yourGroupRoles={roles}
          className="my-1"
          emptyState={<div>No categories found</div>}
        />
      )}
    </Col>
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

  return uniqBy(combined, 'id')
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
