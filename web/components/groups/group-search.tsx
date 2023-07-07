import { Group } from 'common/group'
import { User } from 'common/user'
import { debounce, isEqual, partition, uniqBy } from 'lodash'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GroupsList } from 'web/components/groups/groups-list'
import { useEvent } from 'web/hooks/use-event'
import {
  useGroupsWhereUserHasRole,
  useMyGroupRoles,
} from 'web/hooks/use-group-supabase'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import {
  historyStore,
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import {
  GroupAndRoleType,
  SearchGroupInfo,
  searchGroups,
} from 'web/lib/supabase/groups'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import { Input } from '../widgets/input'

const INITIAL_STATE = {
  groups: undefined,
  fuzzyGroupOffset: 0,
  shouldLoadMore: true,
}

const GROUPS_PER_PAGE = 20

export type groupStateType = {
  groups: SearchGroupInfo[] | undefined
  fuzzyGroupOffset: number
  shouldLoadMore: boolean
}

export default function GroupSearch(props: {
  filter?: { yourGroups?: boolean }
  persistPrefix: string
  yourGroupIds?: string[]
  user?: User | null
}) {
  const { filter, persistPrefix, yourGroupIds = [], user } = props
  const performQuery = useEvent(
    async (currentState, freshQuery?: boolean) =>
      (await debouncedQuery(currentState, freshQuery)) ?? false
  )
  const [state, setState] = usePersistentInMemoryState<groupStateType>(
    INITIAL_STATE,
    `${persistPrefix}-supabase-search`
  )

  const loadMoreGroups = () => performQuery(state)

  const searchTerm = useRef<string>('')
  const [inputTerm, setInputTerm] = useState<string | undefined>(undefined)
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

  const groupsYouModerate = useGroupsWhereUserHasRole(user?.id) ?? []
  const query = async (currentState: groupStateType, freshQuery?: boolean) => {
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
        yourGroups: filter?.yourGroups,
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
        setState(INITIAL_STATE)
        performQuery(state, true)
      }
    }, 100)
  ).current

  const groups = state.groups ? uniqBy(state.groups, 'id') : undefined

  useEffect(() => {
    onSearchTermChanged(inputTerm)
  }, [inputTerm])

  return (
    <Col>
      <Input
        type="text"
        inputMode="search"
        value={inputTerm}
        onChange={(e) => setInputTerm(e.target.value)}
        placeholder="Search groups"
        className="w-full"
      />
      <Spacer h={1} />
      {user && filter?.yourGroups && (!inputTerm || inputTerm === '') ? (
        <YourGroupsList user={user} />
      ) : (
        <GroupsList
          groups={groups}
          loadMore={loadMoreGroups}
          yourGroupIds={yourGroupIds}
          yourGroupRoles={groupsYouModerate}
          className="my-1"
          emptyState={<div>No groups found</div>}
        />
      )}
    </Col>
  )
}

function YourGroupsList(props: { user: User }) {
  const { user } = props
  const roles = useMyGroupRoles(user?.id) ?? []

  roles.sort(
    (a, b) =>
      (b.role === 'admin' ? 2 : b.role === 'moderator' ? 1 : 0) -
      (a.role === 'admin' ? 2 : a.role === 'moderator' ? 1 : 0)
  )

  const groups: SearchGroupInfo[] | null =
    roles?.map((g) => ({
      id: g.group_id!,
      name: g.group_name!,
      slug: g.group_slug!,
      privacyStatus: g.privacy_status as any,
      totalMembers: g.total_members!,
      creatorId: g.creator_id!,
    })) ?? null

  const [privateGroups, nonPrivateGroups] = partition(
    groups,
    (g) => g.privacyStatus === 'private'
  )

  return (
    <>
      <Row className="text-ink-400 mt-4 w-full items-center text-xs font-semibold">
        <div className="whitespace-nowrap">PRIVATE GROUPS</div>
        <hr className="border-ink-400 mx-2 w-full" />
      </Row>
      <GroupsList groups={privateGroups} yourGroupRoles={roles} />
      <Row className="text-ink-400 mt-4 w-full items-center text-xs font-semibold">
        <div className="whitespace-nowrap">NON-PRIVATE GROUPS</div>
        <hr className="border-ink-400 mx-2 w-full" />
      </Row>
      <GroupsList groups={nonPrivateGroups} yourGroupRoles={roles} />
    </>
  )
}
