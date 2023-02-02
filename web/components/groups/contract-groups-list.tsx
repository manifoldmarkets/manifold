import { XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { CHECK_USERNAMES, CORE_USERNAMES } from 'common/envs/constants'
import { Group, GroupLink } from 'common/group'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SiteLink } from 'web/components/widgets/site-link'
import { useAdmin } from 'web/hooks/use-admin'
import { useGroupsWithContract } from 'web/hooks/use-group'
import { useRealtimeGroupMembers } from 'web/hooks/use-group-supabase'
import {
  addContractToGroup,
  removeContractFromGroup,
} from 'web/lib/firebase/api'
import {
  getGroupsWhereUserHasRole,
  getGroupsWhereUserIsMember,
} from 'web/lib/supabase/groups'
import { GroupLinkItem } from 'web/pages/groups'
import { GroupSelector } from './group-selector'

export function ContractGroupsList(props: {
  contract: Contract
  user: User | null | undefined
}) {
  const { user, contract } = props
  const { groupLinks = [] } = contract
  const groups = useGroupsWithContract(contract) ?? []

  const isCreator = contract.creatorId === user?.id
  const adminOrTrustworthyish =
    user &&
    (CORE_USERNAMES.includes(user.username) ||
      CHECK_USERNAMES.includes(user.username))
  const [permittedGroups, setPermittedGroups] = useState<Group[]>([])
  useEffect(() => {
    if (user) {
      if (isCreator) {
        getGroupsWhereUserIsMember(user.id).then((g) =>
          setPermittedGroups(g.map((gp: { group_data: any }) => gp.group_data))
        )
      } else {
        getGroupsWhereUserHasRole(user.id).then((g) =>
          setPermittedGroups(g.map((gp: { group_data: any }) => gp.group_data))
        )
      }
    }
  }, [])
  const isAdmin = useAdmin()
  function canRemoveFromGroup(group: Group) {
    if (!user) {
      return false
    }
    return (
      // if user is contract creator
      contract.creatorId === user.id ||
      // if user has admin role in that group
      (permittedGroups && permittedGroups.some((g) => g.id === group.id)) ||
      // if user is manifoldAdmin
      isAdmin
    )
  }

  return (
    <Col className={'gap-2'}>
      <span className={'text-xl text-indigo-700'}>
        <SiteLink href={'/groups/'}>Groups</SiteLink>
      </span>
      {/* show group add options if user has permissions to add group */}
      {permittedGroups.length > 0 && <></>}
      {/* if is manifold admin, show all possible groups */}
      {isAdmin ||
        (permittedGroups.length > 0 && (
          <Col className={'ml-2 items-center justify-between sm:flex-row'}>
            <span>Add to: </span>
            <GroupSelector
              options={{
                showSelector: true,
                showLabel: false,
                ignoreGroupIds: groupLinks.map((g) => g.groupId),
              }}
              setSelectedGroup={(group) =>
                group &&
                addContractToGroup({
                  groupId: group.id,
                  contractId: contract.id,
                })
              }
              selectedGroup={undefined}
              creator={user}
              permittedGroups={isAdmin ? undefined : permittedGroups}
            />
          </Col>
        ))}
      <Col className="h-96 overflow-auto">
        {groupLinks.length === 0 && (
          <Col className="text-gray-400">No groups yet...</Col>
        )}
        {groupLinks.map((groupLink) => {
          const group = groups.find((g) => g.id === groupLink.groupId)
          return (
            <Row
              key={groupLink.groupId}
              className={clsx('items-center justify-between gap-2 p-2')}
            >
              <Row className="line-clamp-1 h-8 items-center gap-2">
                <GroupLinkItem group={groupLink} />
              </Row>
              {group && canRemoveFromGroup(group) && (
                <Button
                  color={'gray-white'}
                  size={'xs'}
                  onClick={() => {
                    toast.promise(
                      removeContractFromGroup({
                        groupId: group.id,
                        contractId: contract.id,
                      }),
                      {
                        loading: `Removing market from "${group.name}"`,
                        success: `Successfully removed market from "${group.name}"!`,
                        error: `Error removing group. Try again?`,
                      }
                    )
                  }}
                >
                  <XIcon className="h-4 w-4 text-gray-400" />
                </Button>
              )}
            </Row>
          )
        })}
      </Col>
    </Col>
  )
}
