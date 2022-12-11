import { DotsVerticalIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Group } from 'common/group'
import { PrivateUser, User } from 'common/user'
import { groupButtonClass } from 'web/pages/group/[...slugs]'
import { getBlockGroupDropdownItem } from '../buttons/hide-group-button'
import { SimpleLinkButton } from '../buttons/simple-link-button'
import DropdownMenu from '../comments/dropdown-menu'
import { Row } from '../layout/row'

export function GroupOptions(props: {
  group: Group
  groupUrl: string
  privateUser: PrivateUser | undefined | null
}) {
  const { group, groupUrl, privateUser } = props
  return (
    <Row className="items-center gap-2">
      <SimpleLinkButton
        getUrl={() => groupUrl}
        tooltip={`Copy link to ${group.name}`}
        className={groupButtonClass}
      />
      {privateUser && (
        <DropdownMenu
          Items={[
            getBlockGroupDropdownItem({
              groupSlug: group.slug,
              user: privateUser,
            }),
          ]}
          Icon={
            <DotsVerticalIcon className={clsx('h-5 w-5', groupButtonClass)} />
          }
          MenuWidth={'w-60'}
        />
      )}
    </Row>
  )
}
