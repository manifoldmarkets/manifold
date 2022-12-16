import { DotsVerticalIcon, PlusCircleIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Group } from 'common/group'
import { PrivateUser } from 'common/user'
import { useState } from 'react'
import { groupButtonClass } from 'web/pages/group/[...slugs]'
import { SimpleLinkButton } from '../buttons/simple-link-button'
import DropdownMenu, { DropdownItem } from '../comments/dropdown-menu'
import { Row } from '../layout/row'
import { CreateAboutGroupModal } from './create-about-group'
import { getBlockGroupDropdownItem } from './hide-group-item'

export function GroupOptions(props: {
  group: Group
  groupUrl: string
  privateUser: PrivateUser | undefined | null
  isEditable: boolean
}) {
  const { group, groupUrl, privateUser, isEditable } = props
  const [openCreateAboutModal, setOpenCreateAboutModal] = useState(false)
  let groupOptionItems = [] as DropdownItem[]

  if (privateUser) {
    groupOptionItems = groupOptionItems.concat(
      getBlockGroupDropdownItem({
        groupSlug: group.slug,
        user: privateUser,
      })
    )
    if (isEditable && !group.aboutPostId) {
      groupOptionItems = groupOptionItems.concat({
        name: 'Create about section',
        icon: <PlusCircleIcon className="h-5 w-5" />,
        onClick: () => setOpenCreateAboutModal(true),
      })
    }
  }
  return (
    <>
      <Row className="items-center gap-2">
        <SimpleLinkButton
          getUrl={() => groupUrl}
          tooltip={`Copy link to ${group.name}`}
          className={groupButtonClass}
        />
        {privateUser && (
          <DropdownMenu
            Items={groupOptionItems}
            Icon={
              <DotsVerticalIcon className={clsx('h-5 w-5', groupButtonClass)} />
            }
            MenuWidth={'w-60'}
          />
        )}
      </Row>
      <CreateAboutGroupModal
        open={openCreateAboutModal}
        setOpen={setOpenCreateAboutModal}
        group={group}
      />
    </>
  )
}
