import {
  DotsVerticalIcon,
  PencilIcon,
  PlusCircleIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { Group } from 'common/group'
import { PrivateUser } from 'common/user'
import { referralQuery } from 'common/util/share'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { useUser } from 'web/hooks/use-user'
import { groupButtonClass } from 'web/pages/group/[...slugs]'
import DropdownMenu, { DropdownItem } from '../comments/dropdown-menu'
import { Row } from '../layout/row'
import { getBlockGroupDropdownItem } from './hide-group-item'
import { buildArray } from 'common/util/array'
import { QuestionMarkCircleIcon } from '@heroicons/react/outline'

export function GroupOptions(props: {
  group: Group
  groupUrl: string
  privateUser: PrivateUser | undefined | null
  canEdit: boolean
  setWritingNewAbout: (writingNewAbout: boolean) => void
  setEditingName: (editingName: boolean) => void
  onAddMemberClick: () => void
}) {
  const {
    group,
    groupUrl,
    privateUser,
    canEdit,
    setWritingNewAbout,
    onAddMemberClick,
    setEditingName,
  } = props

  const groupOptionItems = buildArray(
    canEdit && {
      name: 'Add members',
      icon: <PlusCircleIcon className="h-5 w-5" />,
      onClick: onAddMemberClick,
    },
    canEdit && {
      name: 'Edit name',
      icon: <PencilIcon className="h-5 w-5" />,
      onClick: () => setEditingName(true),
    },
    canEdit &&
      !group.about && {
        name: 'Create about section',
        icon: <QuestionMarkCircleIcon className="h-5 w-5" />,
        onClick: () => setWritingNewAbout(true),
      },
    privateUser &&
      getBlockGroupDropdownItem({
        groupSlug: group.slug,
        user: privateUser,
      })
  ) as DropdownItem[]

  const user = useUser()
  const shareUrl = user ? groupUrl + referralQuery(user.username) : groupUrl

  return (
    <>
      <Row className="items-center gap-2">
        {group.privacyStatus != 'private' && (
          <CopyLinkOrShareButton
            url={shareUrl}
            tooltip={`Copy link to ${group.name}`}
            className={groupButtonClass}
            eventTrackingName="copy group link"
          />
        )}
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
