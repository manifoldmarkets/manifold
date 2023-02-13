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
import { useGroupsWithContract } from 'web/hooks/use-group'
import {
  addContractToGroup,
  removeContractFromGroup,
} from 'web/lib/firebase/api'
import {
  getGroupsWhereUserHasRole,
  getPublicGroups,
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
  const [adminGroups, setAdminGroups] = useState<Group[]>([])
  const [publicGroups, setPublicGroups] = useState<Group[]>([])

  useEffect(() => {
    if (user) {
      getGroupsWhereUserHasRole(user.id).then((g) =>
        setAdminGroups(g.map((gp: { group_data: any }) => gp.group_data))
      )
    }
  }, [user])

  useEffect(() => {
    if (user) {
      //if user is the creator of contract, show all public groups, and non public groups which use has admin/moderator role
      if (isCreator) {
        getPublicGroups().then((pg) =>
          setPublicGroups(pg.map((pgp: { data: any }) => pgp.data))
        )
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // if user is manifoldAdmin
      isAdmin ||
      // if user has admin role in that group
      (adminGroups && adminGroups.some((g) => g.id === group.id))
    )
  }

  return (
    <Col className={'gap-2'}>
      <span className={'text-xl text-indigo-700'}>
        <SiteLink href={'/groups/'}>Groups</SiteLink>
      </span>
      <Col className="h-96 justify-between overflow-auto">
        <Col>
          {groupLinks.length === 0 && (
            <Col className="text-gray-400">No groups yet...</Col>
          )}
          <Row className="my-2 flex-wrap gap-3">
            {groupLinks.map((groupLink) => {
              const group = groups.find((g) => g.id === groupLink.groupId)
              return (
                <span
                  key={groupLink.groupId}
                  className={clsx(
                    'group relative rounded-full bg-gray-600 p-1 px-4 text-sm text-white transition-colors hover:bg-indigo-600'
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
                          <div className="z-0 h-4 w-4 rounded-full bg-white group-hover:bg-gray-600" />
                          <XCircleIcon className="absolute -inset-1 text-gray-400 group-hover:text-gray-200" />
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
              <Row className="w-full justify-start text-sm text-gray-400">
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
                creator={user}
                permittedGroups={
                  isAdmin
                    ? undefined
                    : isCreator
                    ? adminGroups
                        .filter(
                          (g) =>
                            g.privacyStatus == 'private' ||
                            g.privacyStatus == 'curated'
                        )
                        .concat(publicGroups)
                        .filter((g) => !contract.groupSlugs?.includes(g.slug))
                    : adminGroups
                }
              />
            </Col>
          )}
        </Col>
        <GroupsInfoBlob isCreator={isCreator} />
      </Col>
    </Col>
  )
}

export function GroupsInfoBlob(props: {
  isCreator: boolean
  className?: string
}) {
  const { isCreator, className } = props
  const infoString = isCreator
    ? 'You can only add your market to groups you are a member of. '
    : 'You can only add this market to groups you are an admin or moderator of. '
  return (
    <span className={clsx('text-sm font-light text-gray-600', className)}>
      {infoString}Explore more groups{' '}
      <a
        href="/groups"
        target="_blank"
        className="font-semibold text-indigo-700 hover:text-indigo-500"
      >
        here
      </a>
      !
    </span>
  )
}
