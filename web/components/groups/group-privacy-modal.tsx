import {
  GlobeIcon,
  LockClosedIcon,
  PencilIcon,
  ShieldCheckIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { Group } from 'common/group'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { updateGroupPrivacy } from 'web/lib/firebase/api'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'

export type TranslatedPrivacyStatusType = 'public' | 'restricted' | 'private'

export default function GroupPrivacyStatusModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  status: TranslatedPrivacyStatusType
}) {
  const { open, setOpen, status } = props
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx(MODAL_CLASS)}>
        <div className="-mx-4">
          <PrivacyStatusView viewStatus={status} isSelected={false} size="md" />
        </div>
      </Col>
    </Modal>
  )
}

// should only appear for public/restricted groups
export function AdminGroupPrivacyStatusModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  group: Group
}) {
  const { open, setOpen, group } = props
  const groupPrivacyStatus = getTranslatedPrivacyStatus(group.privacyStatus)
  // can't change if group if private
  if (groupPrivacyStatus == 'private') {
    return (
      <GroupPrivacyStatusModal
        open={open}
        setOpen={setOpen}
        status={'private'}
      />
    )
  }
  // modal to change group privacy type
  return (
    <SelectGroupPrivacyModal
      open={open}
      setOpen={setOpen}
      groupPrivacyStatus={groupPrivacyStatus}
      group={group}
    />
  )
}

function SelectGroupPrivacyModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  groupPrivacyStatus: 'public' | 'restricted'
  group: Group
}) {
  const { open, setOpen, groupPrivacyStatus, group } = props
  const [selectedStatus, setSelectedStatus] = useState<'public' | 'restricted'>(
    groupPrivacyStatus
  )
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx(MODAL_CLASS)}>
        <PrivacyStatusSelect
          snippetStatus="public"
          selectedStatus={selectedStatus}
          setSelectedStatus={setSelectedStatus}
        />
        <PrivacyStatusSelect
          snippetStatus="restricted"
          selectedStatus={selectedStatus}
          setSelectedStatus={setSelectedStatus}
        />
        <Row className="mt-4 w-full justify-end gap-2">
          <Button color="gray" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <ChangePrivacyStatusButton
            disabled={
              selectedStatus == group.privacyStatus ||
              (selectedStatus == 'public' && !group.privacyStatus)
            }
            group={group}
            selectedStatus={selectedStatus}
          />
        </Row>
      </Col>
    </Modal>
  )
}

export function getTranslatedPrivacyStatus(
  groupPrivacyStatus?: 'private' | 'restricted'
) {
  if (!groupPrivacyStatus) {
    return 'public'
  }
  return groupPrivacyStatus
}

export function PrivacyStatusSelect(props: {
  snippetStatus: 'public' | 'restricted'
  selectedStatus: 'public' | 'restricted'
  setSelectedStatus: (selectedStatus: 'public' | 'restricted') => void
}) {
  const { snippetStatus, selectedStatus, setSelectedStatus } = props
  return (
    <PrivacyStatusView
      viewStatus={snippetStatus}
      isSelected={snippetStatus == selectedStatus}
      onClick={() => setSelectedStatus(snippetStatus)}
      size="md"
    />
  )
}

export function PrivacyStatusView(props: {
  viewStatus: 'public' | 'restricted' | 'private'
  isSelected: boolean
  size: 'sm' | 'md'
  onClick?: () => void
}) {
  const { viewStatus, isSelected, onClick, size } = props
  const { icon, bigIcon, status, descriptor } = PRIVACY_STATUS_ITEMS[viewStatus]
  return (
    <Col
      className={clsx(
        'cursor-pointer rounded-lg py-2 px-4',
        isSelected
          ? 'bg-gradient-to-br from-indigo-100 to-transparent ring-2 ring-indigo-500'
          : '',
        size == 'md' ? 'gap-1' : ''
      )}
      onClick={onClick}
    >
      {size == 'md' && (
        <Row className="w-full items-center justify-start gap-1 text-xl">
          {bigIcon}
          {status}
        </Row>
      )}
      {size == 'sm' && (
        <Row className="w-full items-center justify-start gap-1">
          {icon}
          {status}
        </Row>
      )}
      <p className="text-sm text-gray-700">{descriptor}</p>
    </Col>
  )
}

export function ChangePrivacyStatusButton(props: {
  disabled: boolean
  group: Group
  selectedStatus: 'public' | 'restricted'
}) {
  const { disabled, group, selectedStatus } = props
  const [loading, setLoading] = useState(false)
  return (
    <Button
      disabled={disabled}
      onClick={() => {
        setLoading(true)
        toast
          .promise(
            updateGroupPrivacy({
              groupId: group.id,
              privacy: selectedStatus,
            }),
            {
              loading: `Updating privacy to ${selectedStatus}`,
              success: `Privacy successfully updated to ${selectedStatus}!`,
              error: `Unable to update group privacy. Try again?`,
            }
          )
          .finally(() => setLoading(false))
      }}
      loading={loading}
    >
      <Row className="items-center gap-1">
        <PencilIcon className="h-4 w-4" />
        Change privacy
      </Row>
    </Button>
  )
}

export const PRIVACY_STATUS_ITEMS = {
  public: {
    icon: <GlobeIcon className="h-4 w-4" />,
    bigIcon: <GlobeIcon className="h-6 w-6" />,
    status: 'Public',
    descriptor:
      'Anyone can view, join, and add their own markets to your group.',
  },
  restricted: {
    icon: <ShieldCheckIcon className="h-4 w-4" />,
    bigIcon: <ShieldCheckIcon className="h-6 w-6" />,
    status: 'Restricted',
    descriptor:
      'Anyone can view and join your group, but only admins and moderators can add/remove markets',
  },
  private: {
    icon: <LockClosedIcon className="h-4 w-4" />,
    bigIcon: <LockClosedIcon className="h-6 w-6" />,
    status: 'Private',
    descriptor:
      'The content in this group is not viewable by the public. Only approved users can join this group, and only admins and moderators can add/remove markets',
  },
}
