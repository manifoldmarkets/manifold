import { UserGroupIcon } from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/core'
import clsx from 'clsx'
import { Group } from 'common/group'
import { useState } from 'react'
import { useMembers } from 'web/hooks/use-group'
import {
  default as ClosedDoorIcon,
  default as OpenDoorIcon,
} from 'web/lib/icons/open-door-icon'
import { getGroupAdmins } from 'web/lib/supabase/groups'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { MultiUserTransactionModal } from '../multi-user-transaction-link'
import { Avatar } from '../widgets/avatar'
import { LoadingIndicator } from '../widgets/loading-indicator'

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

//for larget groups, getting a too many outstanding requests error
export function GroupMembersWidget(props: { group: Group }) {
  const { group } = props
  const [open, setOpen] = useState(false)
  // const groupMembers = useMembers(group.id)
  // const groupMembersItems = groupMembers
  //   .filter((groupMember) => groupMember)
  //   .map((groupMember) => {
  //     return {
  //       name: groupMember.name,
  //       username: groupMember.username,
  //       avatarUrl: groupMember.avatarUrl,
  //     }
  //   })
  return (
    <>
      <button onClick={() => setOpen(true)}>
        <Row className="cursor-pointer items-center gap-1 text-sm text-gray-700">
          <Row className="items-center gap-1 text-sm text-gray-700"></Row>
          <UserGroupIcon className="h-4 w-4" />
          <span>{group.totalMembers} members</span>
        </Row>
      </button>
      <GroupMembersModal group={group} open={open} setOpen={setOpen} />
    </>
  )
}

export function GroupMembersModal(props: {
  group: Group
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { group, open, setOpen } = props
  const [admins, setAdmins] = useState<JSONContent[] | undefined>(undefined)

  getGroupAdmins(group.id).then(
    (result) => setAdmins(result.data)
    // console.log(result.data)
  )
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={MODAL_CLASS}>
        <span className="text-xl">👥 Members</span>
        <Row className="top-0 w-full gap-2 text-sm text-gray-400">
          <div className="my-auto flex h-[1px] grow bg-gray-400" />
          ADMIN
          <div className="my-auto flex h-[1px] grow bg-gray-400" />
        </Row>
        {admins === undefined ? (
          <LoadingIndicator />
        ) : (
          admins.map((admin) => {
            const isCreator = admin.member_id === admin.creator_id
            const adminTag = (
              <div
                className={clsx(
                  'text-semibold rounded p-1 text-xs text-white',
                  isCreator ? 'bg-indigo-400' : 'bg-indigo-300'
                )}
              >
                {admin.member_id === admin.creator_id ? 'CREATOR' : 'ADMIN'}
              </div>
            )
            return (
              <Row className="items-center justify-between gap-2">
                <Row className="items-center gap-2">
                  <Avatar
                    username={admin.username}
                    avatarUrl={admin.avatarUrl}
                    size={'sm'}
                  />
                  {admin.name}
                  {adminTag}
                </Row>
              </Row>
            )
          })
        )}
      </Col>
    </Modal>
  )
}
