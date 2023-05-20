// import { useEffect, useState } from 'react'
// import { Group, GroupMemberDoc } from 'common/group'
// import { User } from 'common/user'
// import {
//   groupMembers,
//   listenForGroup,
//   listenForGroupContractDocs,
//   listenForGroups,
//   listenForMemberGroupIds,
//   listenForOpenGroups,
//   listGroups,
// } from 'web/lib/firebase/groups'
// import { getUser } from 'web/lib/firebase/users'
// import { filterDefined } from 'common/util/array'
// import { Contract } from 'common/contract'
// import { uniq } from 'lodash'
// import { listenForValues } from 'web/lib/firebase/utils'
// import { useQuery } from 'react-query'
// import { useStoreItems } from './use-store'
// import { getUserIsGroupMember } from 'web/lib/firebase/api'
// import { useIsAuthorized } from './use-user'
// import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
// import { getMemberGroups } from 'web/lib/supabase/groups'
// import { db } from 'web/lib/supabase/db'

// export const useGroup = (groupId: string | undefined) => {
//   const [group, setGroup] = useState<Group | null | undefined>()

//   useEffect(() => {
//     if (groupId) return listenForGroup(groupId, setGroup)
//   }, [groupId])

//   return group
// }

// export const useAllGroups = () => {
//   const [groups, setGroups] = useState<Group[] | undefined>()

//   useEffect(() => {
//     return listenForGroups(setGroups)
//   }, [])

//   return groups
// }

// export const useOpenGroups = () => {
//   const [groups, setGroups] = useState<Group[]>([])

//   useEffect(() => {
//     return listenForOpenGroups(setGroups)
//   }, [])

//   return groups
// }

// export const useMemberGroups = (userId: string | null | undefined) => {
//   const result = useQuery(['member-groups', userId ?? ''], () =>
//     userId ? getMemberGroups(userId, db) : []
//   )
//   return result.data
// }

// used so that follow/unfollow bottons update fast
// TODO: remove firebase listeners and use supabase realtime or optimistic updates
// export const useMemberGroupIds = (user: User | null | undefined) => {
//   const cachedGroups = useMemberGroups(user?.id)

//   const [memberGroupIds, setMemberGroupIds] = useState<string[] | undefined>(
//     cachedGroups?.map((g) => g.id)
//   )

//   useEffect(() => {
//     if (user) {
//       return listenForMemberGroupIds(user.id, (groupIds) => {
//         setMemberGroupIds(groupIds)
//       })
//     }
//   }, [user])

//   return memberGroupIds
// }

// export function useMembers(groupId: string | undefined) {
//   const [members, setMembers] = useState<User[]>([])
//   useEffect(() => {
//     if (groupId)
//       listenForValues<GroupMemberDoc>(groupMembers(groupId), (memDocs) => {
//         const memberIds = memDocs.map((memDoc) => memDoc.userId)
//         Promise.all(memberIds.map((id) => getUser(id))).then((users) => {
//           setMembers(users)
//         })
//       })
//   }, [groupId])
//   return members
// }

// export function useMemberIds(groupId: string | null) {
//   const [memberIds, setMemberIds] = useState<string[]>()
//   useEffect(() => {
//     if (groupId)
//       return listenForValues<GroupMemberDoc>(groupMembers(groupId), (docs) => {
//         setMemberIds(docs.map((doc) => doc.userId))
//       })
//   }, [groupId])
//   return memberIds
// }

// export const useGroupsWithContract = (contract: Contract) => {
//   const [groups, setGroups] = useState<Group[]>()

//   useEffect(() => {
//     if (contract.groupSlugs)
//       listGroups(uniq(contract.groupSlugs)).then((groups) =>
//         setGroups(filterDefined(groups))
//       )
//   }, [contract.groupSlugs])

//   return groups
// }

// export function useGroupContractIds(groupId: string) {
//   const [contractIds, setContractIds] = useState<string[]>([])

//   useEffect(() => {
//     if (groupId)
//       return listenForGroupContractDocs(groupId, (docs) =>
//         setContractIds(docs.map((doc) => doc.contractId))
//       )
//   }, [groupId])

//   return contractIds
// }

// export function useGroups(groupIds: string[]) {
//   return useStoreItems(groupIds, listenForGroup, { loadOnce: true })
// }

// export function useIsGroupMember(groupSlug: string) {
//   const [isMember, setIsMember] = usePersistentInMemoryState<any | undefined>(
//     undefined,
//     'is-member-' + groupSlug
//   )
//   const isAuthorized = useIsAuthorized()
//   useEffect(() => {
//     // if there is no user
//     if (isAuthorized === false) {
//       setIsMember(false)
//     } else if (isAuthorized) {
//       getUserIsGroupMember({ groupSlug: groupSlug }).then((result) => {
//         setIsMember(result)
//       })
//     }
//   }, [groupSlug, isAuthorized])
//   return isMember
// }
