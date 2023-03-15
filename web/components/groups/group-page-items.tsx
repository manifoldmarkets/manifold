import { UserGroupIcon } from '@heroicons/react/solid'
import { Group, PrivacyStatusType } from 'common/group'
import { useState } from 'react'
import { useRealtimeNumGroupMembers } from 'web/hooks/use-group-supabase'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { GroupMemberModalContent } from './group-member-modal'
import GroupPrivacyStatusModal, {
  AdminGroupPrivacyStatusModal,
  PRIVACY_STATUS_ITEMS,
} from './group-privacy-modal'

export default function GroupPrivacyStatusWidget(props: {
  group: Group
  canEdit: boolean
}) {
  const { group, canEdit } = props
  const { icon, status } = PRIVACY_STATUS_ITEMS[group.privacyStatus]
  const [open, setOpen] = useState(false)
  return (
    <>
      <Row
        className="text-ink-700 cursor-pointer items-center gap-1 text-sm"
        onClick={() => setOpen(true)}
      >
        {icon}
        <span>{status}</span>
      </Row>
      {!canEdit && (
        <GroupPrivacyStatusModal
          open={open}
          setOpen={setOpen}
          status={group.privacyStatus}
        />
      )}
      {canEdit && (
        <AdminGroupPrivacyStatusModal
          open={open}
          setOpen={setOpen}
          group={group}
        />
      )}
    </>
  )
}

export function GroupMembersWidget(props: { group: Group; canEdit: boolean }) {
  const { group, canEdit } = props
  const [open, setOpen] = useState(false)
  const numMembers = useRealtimeNumGroupMembers(group.id)
  return (
    <>
      <button onClick={() => setOpen(true)}>
        <Row className="text-ink-700 cursor-pointer items-center gap-1 text-sm">
          <Row className="text-ink-700 items-center gap-1 text-sm"></Row>
          <UserGroupIcon className="h-4 w-4" />
          <span>{numMembers} members</span>
        </Row>
      </button>
      <Modal open={open} setOpen={setOpen}>
        <GroupMemberModalContent
          group={group}
          canEdit={canEdit}
          numMembers={numMembers}
        />
      </Modal>
    </>
  )
}
