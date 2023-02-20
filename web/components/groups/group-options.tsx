import {
  DotsVerticalIcon,
  PencilIcon,
  PlusCircleIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { Group } from 'common/group'
import { PrivateUser } from 'common/user'
import { groupButtonClass } from 'web/pages/group/[...slugs]'
import DropdownMenu, { DropdownItem } from '../comments/dropdown-menu'
import { Row } from '../layout/row'
import { getBlockGroupDropdownItem } from './hide-group-item'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'
import { useState } from 'react'
import { AddMemberModal } from './add-member-modal'

export function GroupOptions(props: {
  group: Group
  groupUrl: string
  privateUser: PrivateUser | undefined | null
  canEdit: boolean
  setWritingNewAbout: (writingNewAbout: boolean) => void
}) {
  const { group, groupUrl, privateUser, canEdit, setWritingNewAbout } = props
  const [openAddMemberModal, setOpenAddMemberModal] = useState(false)
  let groupOptionItems = [] as DropdownItem[]
  if (canEdit) {
    groupOptionItems = groupOptionItems.concat({
      name: 'Add members',
      icon: <PlusCircleIcon className="h-5 w-5" />,
      onClick: () => setOpenAddMemberModal(true),
    })
  }
  if (privateUser) {
    groupOptionItems = groupOptionItems.concat(
      getBlockGroupDropdownItem({
        groupSlug: group.slug,
        user: privateUser,
      })
    )
    if (canEdit && !group.aboutPostId) {
      groupOptionItems = groupOptionItems.concat({
        name: 'Create about section',
        icon: <PencilIcon className="h-5 w-5" />,
        onClick: () => setWritingNewAbout(true),
      })
    }
  }
  return (
    <>
      <Row className="items-center gap-2">
        <CopyLinkButton
          url={groupUrl}
          linkIconOnlyProps={{
            tooltip: `Copy link to ${group.name}`,
            className: groupButtonClass,
          }}
        />
        {privateUser && (
          <DropdownMenu
            Items={groupOptionItems}
            Icon={
              <DotsVerticalIcon className={clsx('h-5 w-5', groupButtonClass)} />
            }
            menuWidth={'w-60'}
            className="z-40"
          />
        )}
      </Row>
      <AddMemberModal
        open={openAddMemberModal}
        setOpen={setOpenAddMemberModal}
        group={group}
      />
    </>
  )
}
