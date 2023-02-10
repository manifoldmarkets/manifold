import { UserGroupIcon } from '@heroicons/react/solid'
import { Group } from 'common/group'
import { useState } from 'react'
import { useRealtimeNumGroupMembers } from 'web/hooks/use-group-supabase'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { GroupMemberModalContent } from './group-member-modal'
import GroupPrivacyStatusModal, {
  AdminGroupPrivacyStatusModal,
  getTranslatedPrivacyStatus,
  PRIVACY_STATUS_ITEMS,
} from './group-privacy-modal'

export default function GroupPrivacyStatusWidget(props: {
  group: Group
  canEdit: boolean
}) {
  const { group, canEdit } = props
  const translatedStatus = getTranslatedPrivacyStatus(group.privacyStatus)
  const { icon, status } = PRIVACY_STATUS_ITEMS[translatedStatus]
  const [open, setOpen] = useState(false)
  return (
    <>
      <Row
        className="cursor-pointer items-center gap-1 text-sm text-gray-700"
        onClick={() => setOpen(true)}
      >
        {icon}
        <span>{status}</span>
      </Row>
      {!canEdit && (
        <GroupPrivacyStatusModal
          open={open}
          setOpen={setOpen}
          status={translatedStatus}
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
        <Row className="cursor-pointer items-center gap-1 text-sm text-gray-700">
          <Row className="items-center gap-1 text-sm text-gray-700"></Row>
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
