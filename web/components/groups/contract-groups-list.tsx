import { XCircleIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { Group } from 'common/group'
import { User } from 'common/user'
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
import { GroupLinkItem } from 'web/pages/groups'
import { GroupSelector } from './group-selector'
import { useGroupsWithContract } from 'web/hooks/use-group-supabase'
import { useGroupsWhereUserHasRole } from 'web/hooks/use-group-supabase'
import { useState } from 'react'

export function ContractGroupsList(props: {
  contract: Contract
  user: User | null | undefined
}) {
  const { user, contract } = props
  const groups = useGroupsWithContract(contract) ?? []

  const isCreator = contract.creatorId === user?.id
  const adminGroups = useGroupsWhereUserHasRole(user?.id)
  const [error, setError] = useState<string>('')
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
      (adminGroups && adminGroups.some((g) => g.group_id === group.id))
    )
  }

  return (
    <Col className={'gap-2'}>
      <span className={'text-primary-700 text-xl'}>
        <SiteLink href={'/groups/'}>Groups</SiteLink>
      </span>
      <Col className="h-96 justify-between overflow-auto">
        <Col>
          {groups.length === 0 && (
            <Col className="text-ink-400">No groups yet...</Col>
          )}
          <Row className="my-2 flex-wrap gap-3">
            {groups.map((g) => {
              return (
                <span
                  key={g.id}
                  className={clsx(
                    'text-ink-1000 bg-ink-100 hover:bg-ink-200 group relative rounded-full p-1 px-4 text-sm transition-colors'
                  )}
                >
                  <GroupLinkItem group={g} />
                  {g && canRemoveFromGroup(g) && (
                    <div className="absolute -top-2 -right-4 md:invisible md:group-hover:visible">
                      <IconButton
                        size={'xs'}
                        onClick={() => {
                          toast.promise(
                            removeContractFromGroup({
                              groupId: g.id,
                              contractId: contract.id,
                            }).catch((e) => {
                              console.error(e.message)
                              throw e
                            }),
                            {
                              loading: `Removing question from "${g.name}"`,
                              success: `Successfully removed question from "${g.name}"!`,
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
          {(isAdmin ||
            isCreator ||
            (adminGroups && adminGroups.length > 0)) && (
            <Col className={'my-2 items-center justify-between p-0.5'}>
              <Row className="text-ink-400 w-full justify-start text-sm">
                Add to group
              </Row>
              <GroupSelector
                options={{
                  showSelector: true,
                  showLabel: false,
                  ignoreGroupIds: groups.map((g) => g.id),
                }}
                setSelectedGroup={(group) =>
                  group &&
                  addContractToGroup({
                    groupId: group.id,
                    contractId: contract.id,
                  }).catch((e) => {
                    console.error(e.message)
                    setError(e.message)
                  })
                }
                selectedGroup={undefined}
                isContractCreator={isCreator}
              />
              <span className={'text-sm text-red-400'}>{error}</span>
            </Col>
          )}
        </Col>
      </Col>
    </Col>
  )
}
