import { UserGroupIcon } from '@heroicons/react/solid'
import { Group } from 'common/group'
import { useState } from 'react'
import { useMembers } from 'web/hooks/use-group'
import {
  default as ClosedDoorIcon,
  default as OpenDoorIcon,
} from 'web/lib/icons/open-door-icon'
import { Row } from '../layout/row'
import { MultiUserTransactionModal } from '../multi-user-transaction-link'

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
  //   const groupMembers = useMembers(group.id)
  //   const groupMembersItems = groupMembers
  //     .filter((groupMember) => groupMember)
  //     .map((groupMember) => {
  //       return {
  //         name: groupMember.name,
  //         username: groupMember.username,
  //         avatarUrl: groupMember.avatarUrl,
  //       }
  //     })
  return (
    <>
      {/* <button onClick={() => setOpen(true)}> */}
      <Row className="cursor-pointer items-center gap-1 text-sm text-gray-700">
        <Row className="items-center gap-1 text-sm text-gray-700"></Row>
        <UserGroupIcon className="h-4 w-4" />
        <span>{group.totalMembers} members</span>
      </Row>
      {/* </button> */}
      {/* <MultiUserTransactionModal
        userInfos={groupMembersItems}
        modalLabel="Members"
        open={open}
        setOpen={setOpen}
      /> */}
    </>
  )
}
