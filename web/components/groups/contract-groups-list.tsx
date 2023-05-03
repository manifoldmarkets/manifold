import { XCircleIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { Group } from 'common/group'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { IconButton } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SiteLink } from 'web/components/widgets/site-link'
import { useAdmin } from 'web/hooks/use-admin'
import {
  addContractToGroup,
  removeContractFromGroup,
} from 'web/lib/firebase/api'
import { getGroupsWhereUserHasRole } from 'web/lib/supabase/groups'
import { GroupLinkItem } from 'web/pages/groups'
import { GroupSelector } from './group-selector'
import { useGroupsWithContract } from 'web/hooks/use-group-supabase'

export function ContractGroupsList(props: {
  contract: Contract
  user: User | null | undefined
}) {
  const { user, contract } = props
  const { groupLinks = [] } = contract
  const groups = useGroupsWithContract(contract) ?? []

  const isCreator = contract.creatorId === user?.id
  const [adminGroups, setAdminGroups] = useState<Group[]>([])

  useEffect(() => {
    if (user) {
      getGroupsWhereUserHasRole(user.id).then((g) =>
        setAdminGroups(g.map((gp: { group_data: any }) => gp.group_data))
      )
    }
  }, [user])

  const isAdmin = useAdmin()
  function canRemoveFromGroup(group: Group) {
    if (!user) {
      return false
    }
    return (
      // if user is contract creator
      contract.creatorId === user.id ||
      // if user is manifoldAdmin
      isAdmin ||
      // if user has admin role in that group
      (adminGroups && adminGroups.some((g) => g.id === group.id))
    )
  }

  return (
    <Col className={'gap-2'}>
      <span className={'text-primary-700 text-xl'}>
        <SiteLink href={'/groups/'}>Groups</SiteLink>
      </span>
      <Col className="h-96 justify-between overflow-auto">
        <Col>
          {groupLinks.length === 0 && (
            <Col className="text-ink-400">No groups yet...</Col>
          )}
          <Row className="my-2 flex-wrap gap-3">
            {groupLinks.map((groupLink) => {
              const group = groups.find((g) => g.id === groupLink.groupId)
              return (
                <span
                  key={groupLink.groupId}
                  className={clsx(
                    'bg-ink-600 text-ink-0 hover:bg-primary-600 group relative rounded-full p-1 px-4 text-sm transition-colors'
                  )}
                >
                  <GroupLinkItem group={groupLink} />
                  {group && canRemoveFromGroup(group) && (
                    <div className="absolute -top-2 -right-4 md:invisible md:group-hover:visible">
                      <IconButton
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
                        <div className="group relative transition-colors">
                          <div className="group-hover:bg-ink-600 bg-canvas-0 z-0 h-4 w-4 rounded-full" />
                          <XCircleIcon className="text-ink-400 group-hover:text-ink-200 absolute -inset-1" />
                        </div>
                      </IconButton>
                    </div>
                  )}
                </span>
              )
            })}
          </Row>
          {/* if is manifold admin, show all possible groups */}
          {(isAdmin || isCreator || adminGroups.length > 0) && (
            <Col className={'my-2 items-center justify-between p-0.5'}>
              <Row className="text-ink-400 w-full justify-start text-sm">
                Add to group
              </Row>
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
                isContractCreator={isCreator}
              />
            </Col>
          )}
        </Col>
      </Col>
    </Col>
  )
}
