import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { GroupLinkItem } from 'web/pages/groups'
import { XIcon } from '@heroicons/react/outline'
import { Button } from 'web/components/button'
import { GroupSelector } from 'web/components/groups/group-selector'
import {
  addContractToGroup,
  canModifyGroupContracts,
  removeContractFromGroup,
} from 'web/lib/firebase/groups'
import { User } from 'common/user'
import { Contract } from 'common/contract'
import { SiteLink } from 'web/components/site-link'
import { GroupLink } from 'common/group'
import { useGroupsWithContract } from 'web/hooks/use-group'

export function ContractGroupsList(props: {
  groupLinks: GroupLink[]
  contract: Contract
  user: User | null | undefined
}) {
  const { groupLinks, user, contract } = props
  const groups = useGroupsWithContract(contract)
  return (
    <Col className={'gap-2'}>
      <span className={'text-xl text-indigo-700'}>
        <SiteLink href={'/groups/'}>Groups</SiteLink>
      </span>
      {user && (
        <Col className={'ml-2 items-center justify-between sm:flex-row'}>
          <span>Add to: </span>
          <GroupSelector
            options={{
              showSelector: true,
              showLabel: false,
              ignoreGroupIds: groupLinks.map((g) => g.groupId),
            }}
            setSelectedGroup={(group) =>
              group && addContractToGroup(group, contract, user.id)
            }
            selectedGroup={undefined}
            creator={user}
          />
        </Col>
      )}
      {groups.length === 0 && (
        <Col className="ml-2 h-full justify-center text-gray-500">
          No groups yet...
        </Col>
      )}
      {groups.map((group) => (
        <Row
          key={group.id}
          className={clsx('items-center justify-between gap-2 p-2')}
        >
          <Row className="line-clamp-1 items-center gap-2">
            <GroupLinkItem group={group} />
          </Row>
          {user && canModifyGroupContracts(group, user.id) && (
            <Button
              color={'gray-white'}
              size={'xs'}
              onClick={() => removeContractFromGroup(group, contract, user.id)}
            >
              <XIcon className="h-4 w-4 text-gray-500" />
            </Button>
          )}
        </Row>
      ))}
    </Col>
  )
}
