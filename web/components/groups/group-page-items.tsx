import { UserGroupIcon } from '@heroicons/react/solid'
import { Group } from 'common/group'
import { User } from 'common/user'
import { useState } from 'react'
import {
  default as ClosedDoorIcon,
  default as OpenDoorIcon,
} from 'web/lib/icons/open-door-icon'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { GroupMemberModalContent, groupRoleType } from './group-member-modal'

export default function GroupOpenClosedWidget(props: { group: Group }) {
  const { group } = props
  return (
    <Row className="items-center gap-1 text-sm text-gray-700">
      {group.anyoneCanJoin && (
        <>
          <OpenDoorIcon className="h-4 w-4" />
          <span>Open</span>
        </>
      )}
      {!group.anyoneCanJoin && (
        <>
          <ClosedDoorIcon className="h-4 w-4" />
          <span>Closed</span>
        </>
      )}
    </Row>
  )
}

export function GroupMembersWidget(props: { group: Group; canEdit: boolean }) {
  const { group, canEdit } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>
        <Row className="cursor-pointer items-center gap-1 text-sm text-gray-700">
          <Row className="items-center gap-1 text-sm text-gray-700"></Row>
          <UserGroupIcon className="h-4 w-4" />
          <span>{group.totalMembers} members</span>
        </Row>
      </button>
      <Modal open={open} setOpen={setOpen}>
        <GroupMemberModalContent group={group} canEdit={canEdit} />
      </Modal>
    </>
  )
}
