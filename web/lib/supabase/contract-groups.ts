import { run } from 'common/supabase/utils'
import { uniqBy } from 'lodash'
import { db } from './db'
import { getGroupsWhereUserIsMember } from './groups'

const GROUPS_LIST_SIZE = 50

export async function getInitialGroupsToAdd(props: {
  userId: string
  isCreator: boolean
  isManifoldAdmin: boolean
}) {
  const { userId, isManifoldAdmin, isCreator } = props
  // if is Manifold Admin or Creator, shows all public groups in order of popularity
  if (isManifoldAdmin || isCreator) {
    const publicGroups = await run(
      db
        .from('groups')
        .select('data')
        .eq('data->>privacyStatus', 'public')
        .order('data->totalMembers', { ascending: false } as any)
        .limit(GROUPS_LIST_SIZE)
    )

    return publicGroups.data.map((item) => item.data)
  } else {
    // if is not admin/creator, show all non-private groups that they are admin/moderator of
    const userAdminGroups = await run(
      db
        .from('group_role')
        .select('group_data')
        .eq('member_id', userId)
        .or('role.eq.admin,role.eq.moderator')
        .or(
          'group_data->>privacyStatus.eq.public,group_data->>privacyStatus.eq.curated'
        )
        .order('group_data->totalMembers', { ascending: false } as any)
        .limit(GROUPS_LIST_SIZE)
    )
    return userAdminGroups.data.map((item) => item.group_data)
  }
}

export async function searchGroupsToAdd(props: {
  userId: string
  isCreator: boolean
  isManifoldAdmin: boolean
  prompt: string
  ignoreGroupIds?: string[]
}) {
  const { userId, isCreator, isManifoldAdmin, prompt, ignoreGroupIds } = props
  if (!prompt || prompt === '') {
    const data = await getInitialGroupsToAdd({
      userId: userId,
      isCreator: isCreator,
      isManifoldAdmin: isManifoldAdmin,
    })
    return data
  }

  let baseQuery
  if (isManifoldAdmin) {
    //if is manifold admin, select from all groups that are not private
    const [{ data: exactData }, { data: prefixData }, { data: containsData }] =
      await Promise.all([
        run(
          db
            .from('groups')
            .select('*')
            .or(
              'data->>privacyStatus.eq.public,data->>privacyStatus.eq.curated'
            )
            .ilike('data->>name', `${prompt}`)
            .order('data->totalMembers', { ascending: false } as any)
            .limit(GROUPS_LIST_SIZE)
        ),
        run(
          db
            .from('groups')
            .select('*')
            .or(
              'data->>privacyStatus.eq.public,data->>privacyStatus.eq.curated'
            )
            .ilike('data->>name', `${prompt}%`)
            .order('data->totalMembers', { ascending: false } as any)
            .limit(GROUPS_LIST_SIZE)
        ),
        run(
          db
            .from('groups')
            .select('*')
            .or(
              'data->>privacyStatus.eq.public,data->>privacyStatus.eq.curated'
            )
            .ilike('data->>name', `%${prompt}%`)
            .order('data->totalMembers', { ascending: false } as any)
            .limit(GROUPS_LIST_SIZE)
        ),
      ])

    return uniqBy([...exactData, ...prefixData, ...containsData], 'id')
      .slice(0, GROUPS_LIST_SIZE)
      .map((item) => item.data)
  } else if (isCreator) {
    //if is manifold creator, select from all groups that are public, and curated groups user is an admin/moderator of
    const [{ data: exactData }, { data: prefixData }, { data: containsData }] =
      await Promise.all([
        run(
          db
            .from('group_role')
            .select('group_id,group_data')
            .or(
              'group_data->>privacyStatus.eq.public,role.eq.admin,role.eq.curated'
            )
            .neq('group_data->>privacyStatus', 'private')
            .ilike('group_data->>name', `${prompt}`)
            .order('group_data->totalMembers', { ascending: false } as any)
            .limit(GROUPS_LIST_SIZE)
        ),
        run(
          db
            .from('group_role')
            .select('group_id,group_data')
            .or(
              'group_data->>privacyStatus.eq.public,role.eq.admin, role.eq.curated'
            )
            .neq('group_data->>privacyStatus', 'private')
            .ilike('group_data->>name', `${prompt}%`)
            .order('group_data->totalMembers', { ascending: false } as any)
            .limit(GROUPS_LIST_SIZE)
        ),
        run(
          db
            .from('group_role')
            .select('group_id,group_data')
            .or(
              'group_data->>privacyStatus.eq.public,role.eq.admin, role.eq.curated'
            )
            .neq('group_data->>privacyStatus', 'private')
            .ilike('group_data->>name', `%${prompt}%`)
            .order('group_data->totalMembers', { ascending: false } as any)
            .limit(GROUPS_LIST_SIZE)
        ),
      ])

    return uniqBy([...exactData, ...prefixData, ...containsData], 'group_id')
      .slice(0, GROUPS_LIST_SIZE)
      .map((item) => item.group_data)
  } else {
    //only return non private groups user has an admin role in
    const [{ data: exactData }, { data: prefixData }, { data: containsData }] =
      await Promise.all([
        run(
          db
            .from('group_role')
            .select('group_id,group_data')
            .eq('member_id', userId)
            .or('role.eq.admin,role.eq.moderator')
            .neq('group_data->>privacyStatus', 'private')
            .ilike('group_data->>name', `${prompt}`)
            .order('group_data->totalMembers', { ascending: false } as any)
            .limit(GROUPS_LIST_SIZE)
        ),
        run(
          db
            .from('group_role')
            .select('group_id,group_data')
            .eq('member_id', userId)
            .or('role.eq.admin,role.eq.moderator')
            .neq('group_data->>privacyStatus', 'private')
            .ilike('group_data->>name', `${prompt}%`)
            .order('group_data->totalMembers', { ascending: false } as any)
            .limit(GROUPS_LIST_SIZE)
        ),
        run(
          db
            .from('group_role')
            .select('group_id,group_data')
            .eq('member_id', userId)
            .or('role.eq.admin,role.eq.moderator')
            .neq('group_data->>privacyStatus', 'private')
            .ilike('group_data->>name', `%${prompt}%`)
            .order('group_data->totalMembers', { ascending: false } as any)
            .limit(GROUPS_LIST_SIZE)
        ),
      ])

    return uniqBy([...exactData, ...prefixData, ...containsData], 'group_id')
      .slice(0, GROUPS_LIST_SIZE)
      .map((item) => item.group_data)
  }
}
