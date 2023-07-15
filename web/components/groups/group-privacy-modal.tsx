import {
  GlobeIcon,
  LockClosedIcon,
  PencilIcon,
  ShieldCheckIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { Group, PrivacyStatusType } from 'common/group'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { updateGroupPrivacy } from 'web/lib/firebase/api'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { Tooltip } from '../widgets/tooltip'

export default function GroupPrivacyStatusModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  status: PrivacyStatusType
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

// should only appear for public/curated groups
export function AdminGroupPrivacyStatusModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  group: Group
}) {
  const { open, setOpen, group } = props
  // can't change if group if private
  if (group.privacyStatus == 'private') {
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
      groupPrivacyStatus={group.privacyStatus}
      group={group}
    />
  )
}

function SelectGroupPrivacyModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  groupPrivacyStatus: 'public' | 'curated'
  group: Group
}) {
  const { open, setOpen, groupPrivacyStatus, group } = props
  const [selectedStatus, setSelectedStatus] = useState<'public' | 'curated'>(
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
          snippetStatus="curated"
          selectedStatus={selectedStatus}
          setSelectedStatus={setSelectedStatus}
        />
        <Row className="mt-4 w-full justify-end gap-2">
          <Button color="gray" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <ChangePrivacyStatusButton
            disabled={selectedStatus == group.privacyStatus}
            group={group}
            selectedStatus={selectedStatus}
            setOpen={setOpen}
          />
        </Row>
      </Col>
    </Modal>
  )
}

export function PrivacyStatusSelect(props: {
  snippetStatus: 'public' | 'curated'
  selectedStatus: 'public' | 'curated'
  setSelectedStatus: (selectedStatus: 'public' | 'curated') => void
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
  viewStatus: PrivacyStatusType
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
          ? 'from-primary-100 ring-primary-500 bg-gradient-to-br to-transparent ring-2'
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
        <Row className="justify-between">
          <Row className="w-full items-center gap-1 ">
            {icon}
            {status}
          </Row>
          {viewStatus == 'private' && (
            <Tooltip
              text={
                'This feature is still under active development. Please use at your own discretion'
              }
              placement={'top-end'}
            >
              <div className="rounded bg-yellow-200 bg-opacity-60 px-1 text-sm font-semibold text-yellow-800 ">
                BETA
              </div>
            </Tooltip>
          )}
        </Row>
      )}
      <p className="text-ink-700 text-sm">{descriptor}</p>
    </Col>
  )
}

export function ChangePrivacyStatusButton(props: {
  disabled: boolean
  group: Group
  selectedStatus: 'public' | 'curated'
  setOpen: (open: boolean) => void
}) {
  const { disabled, group, selectedStatus, setOpen } = props
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
          .then(() => setOpen(false))
          .finally(() => {
            setLoading(false)
          })
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
      'Anyone can view, join, and add their own questions to this group.',
  },
  curated: {
    icon: <ShieldCheckIcon className="h-4 w-4" />,
    bigIcon: <ShieldCheckIcon className="h-6 w-6" />,
    status: 'Curated',
    descriptor:
      'Anyone can view and join this group, but only admins and moderators can add/remove questions.',
  },
  private: {
    icon: <LockClosedIcon className="h-4 w-4" />,
    bigIcon: <LockClosedIcon className="h-6 w-6" />,
    status: 'Private',
    descriptor:
      'The content in this group is not viewable by the public. Only approved users can join this group. Manifold devs may view for development reasons.',
  },
}
