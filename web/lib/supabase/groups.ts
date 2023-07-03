import { DESTINY_GROUP_SLUGS } from 'common/envs/constants'
import { Group } from 'common/group'
import { run, SupabaseClient } from 'common/supabase/utils'
import { db } from './db'
import { Contract } from '../firebase/contracts'
import { groupStateType } from 'web/components/groups/group-search'
import { supabaseSearchGroups } from '../firebase/api'
import { convertGroup } from 'common/supabase/groups'
export type SearchGroupInfo = Pick<
  Group,
  'id' | 'name' | 'slug' | 'about' | 'totalMembers' | 'privacyStatus'
>

export async function getGroupContracts(groupId: string) {
  const { data } = await run(
    db.rpc('get_group_contracts', {
      this_group_id: groupId,
    })
  )
  if (data && data.length > 0) {
    return data.map((contract) => (contract as any).data as Contract)
  }
  return []
}

export async function searchGroups(props: {
  state?: groupStateType
  term: string
  offset?: number
  limit: number
  yourGroups?: boolean
  addingToContract?: boolean
  newContract?: boolean
}) {
  const {
    term,
    offset = 0,
    limit,
    yourGroups,
    addingToContract,
    newContract,
  } = props
  const state = props.state ?? {
    groups: undefined,
    fuzzyGroupOffset: 0,
    shouldLoadMore: false,
  }

  if (limit === 0) {
    return { fuzzyOffset: 0, data: [] }
  }

  if (!term) {
    const groups = await supabaseSearchGroups({
      term: '',
      offset: offset,
      limit: limit,
      yourGroups,
      addingToContract: addingToContract ?? false,
      newContract: newContract ?? false,
    })
    if (groups) {
      return { fuzzyOffset: 0, data: groups }
    }
  }
  if (state.fuzzyGroupOffset > 0) {
    const contractFuzzy = searchGroupsFuzzy({
      term,
      state,
      limit,
      yourGroups,
      addingToContract: addingToContract ?? false,
      newContract: newContract ?? false,
    })
    return contractFuzzy
  }

  const groups = await supabaseSearchGroups({
    term: term,
    offset,
    limit,
    fuzzy: false,
    yourGroups,
    addingToContract: addingToContract ?? false,
    newContract: newContract ?? false,
  })
  if (groups) {
    if (groups.length == limit) {
      return { fuzzyOffset: 0, data: groups }
    } else {
      const fuzzyData = await searchGroupsFuzzy({
        state,
        term,
        limit: limit - groups.length,
        yourGroups: yourGroups,
        addingToContract: addingToContract ?? false,
        newContract: newContract ?? false,
      })
      return {
        fuzzyOffset: fuzzyData.fuzzyOffset,
        data: groups.concat(fuzzyData.data),
      }
    }
  }
  return { fuzzyOffset: 0, data: [] }
}

export async function searchGroupsFuzzy(props: {
  state: groupStateType
  term: string
  limit: number
  yourGroups?: boolean
  addingToContract?: boolean
  newContract?: boolean
}) {
  const { state, term, limit, yourGroups, addingToContract, newContract } =
    props
  const groups = await supabaseSearchGroups({
    term,
    offset: state.fuzzyGroupOffset,
    limit: limit,
    fuzzy: true,
    yourGroups,
    addingToContract: addingToContract ?? false,
    newContract: newContract ?? false,
  })
  if (groups) {
    return {
      fuzzyOffset: groups.length,
      data: groups,
    }
  }
  return { fuzzyOffset: 0, data: [] }
}

export async function getMemberGroups(userId: string, db: SupabaseClient) {
  const groupIds = await getMemberGroupIds(userId, db)
  const query = db.from('groups').select().in('id', groupIds)

  return (await run(query)).data.map(convertGroup)
}

export async function getShouldBlockDestiny(
  userId: string,
  db: SupabaseClient
) {
  const groupIds = await getMemberGroupIds(userId, db)
  const { data } = await run(
    db
      .from('groups')
      .select('data')
      .in('id', groupIds)
      .in('slug', DESTINY_GROUP_SLUGS)
  )

  return data.length === 0
}

export async function getMemberGroupIds(userId: string, db: SupabaseClient) {
  const { data: groupIds } = await run(
    db.from('group_members').select('group_id').eq('member_id', userId)
  )

  return groupIds ? groupIds.map((groupId) => groupId.group_id) : []
}

export async function getMemberGroupsCount(userId: string) {
  const { count } = await run(
    db
      .from('group_members')
      .select('*', { head: true, count: 'exact' })
      .eq('member_id', userId)
  )
  return count
}

export type GroupAndRoleType = {
  group: Group
  role: string
}
// gets all groups where the user is an admin or moderator
export async function getGroupsWhereUserHasRole(userId: string) {
  const groupThings = await run(
    db
      .from('group_role')
      .select('*')
      .eq('member_id', userId)
      .or('role.eq.admin,role.eq.moderator')
      .order('name')
  )

  return groupThings.data.map((d) => {
    const group = d.group_data as Group
    const id = d.group_id as string
    group.id = id

    return {
      group,
      role: d.role as string,
    }
  })
}

// gets all groups where the user is member
export async function getGroupsWhereUserIsMember(userId: string) {
  const groupThings = await run(
    db
      .from('group_role')
      .select('group_data')
      .eq('member_id', userId)
      .order('name')
  )

  return groupThings.data
}

// gets all public groups
export async function getPublicGroups() {
  const { data } = await run(
    db.from('groups').select().eq('privacy_status', 'public').order('name')
  )

  return data.map(convertGroup)
}

export async function getGroupBySlug(groupSlug: string) {
  const { data } = await run(
    db.from('groups').select().eq('slug', groupSlug).limit(1)
  )
  return data?.length ? convertGroup(data[0]) : null
}

export async function getGroup(groupId: string) {
  const { data } = await run(
    db.from('groups').select().eq('id', groupId).limit(1)
  )
  return data?.length ? convertGroup(data[0]) : null
}

export async function getGroupContractIds(groupId: string) {
  const { data } = await run(
    db.from('group_contracts').select('contract_id').eq('group_id', groupId)
  )
  if (data) {
    return data.map((group) => group.contract_id)
  }
  return []
}

export async function listGroupsBySlug(groupSlugs: string[]) {
  const { data } = await run(db.from('groups').select().in('slug', groupSlugs))
  if (data) {
    return data.map(convertGroup)
  }
  return []
}

export async function getMemberPrivateGroups(userId: string) {
  const { data } = await run(
    db
      .from('group_role')
      .select('group_data')
      .eq('privacy_status', 'private')
      .eq('member_id', userId)
  )
  if (data && data.length > 0) {
    return data.map((group) => group.group_data as Group)
  }
  return []
}

export async function getYourNonPrivateNonModeratorGroups(userId: string) {
  const { data } = await run(
    db
      .from('group_role')
      .select('*')
      .eq('member_id', userId)
      .neq('privacy_status', 'private')
      .order('createdtime', { ascending: false })
  )
  if (data) {
    const filteredData = data
      .filter((item) => item.role !== 'admin' && item.role !== 'moderator')
      .map((item) => item.group_data) // map to get only group_data
    return filteredData as Group[]
  }
  return []
}

export async function leaveGroup(groupId: string, userId: string) {
  await run(
    db
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('member_id', userId)
  )
}
