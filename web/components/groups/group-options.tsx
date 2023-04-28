import {
  DotsVerticalIcon,
  PencilIcon,
  PlusCircleIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { Group } from 'common/group'
import { PrivateUser } from 'common/user'
import { referralQuery } from 'common/util/share'
import { useState } from 'react'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'
import { useUser } from 'web/hooks/use-user'
import {
  MEMBER_INVITE_INDEX,
  groupButtonClass,
} from 'web/pages/group/[...slugs]'
import DropdownMenu, { DropdownItem } from '../comments/dropdown-menu'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { GroupMemberModalContent } from './group-member-modal'
import { getBlockGroupDropdownItem } from './hide-group-item'

export function GroupOptions(props: {
  group: Group
  groupUrl: string
  privateUser: PrivateUser | undefined | null
  canEdit: boolean
  setWritingNewAbout: (writingNewAbout: boolean) => void
  onAddMemberClick: () => void
}) {
  const {
    group,
    groupUrl,
    privateUser,
    canEdit,
    setWritingNewAbout,
    onAddMemberClick,
  } = props

  let groupOptionItems = [] as DropdownItem[]

  if (canEdit) {
    groupOptionItems = groupOptionItems.concat({
      name: 'Add members',
      icon: <PlusCircleIcon className="h-5 w-5" />,
      onClick: onAddMemberClick,
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

  const user = useUser()
  const shareUrl = user ? groupUrl + referralQuery(user.username) : groupUrl

  return (
    <>
      <Row className="items-center gap-2">
        <CopyLinkButton
          url={shareUrl}
          linkIconOnlyProps={{
            tooltip: `Copy link to ${group.name}`,
            className: groupButtonClass,
          }}
          eventTrackingName="copy group link"
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
    </>
  )
}
