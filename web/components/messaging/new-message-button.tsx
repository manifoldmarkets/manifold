import { PlusIcon } from '@heroicons/react/solid'
import { Button, IconButton } from '../buttons/button'
import { useState } from 'react'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { Col } from '../layout/col'
import { createPrivateMessageChannelWithUsers } from 'web/lib/api/api'
import { useRouter } from 'next/router'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { SelectUsers } from 'web/components/select-users'
import { DisplayUser } from 'common/api/user-types'
import { usePrivateUser } from 'web/hooks/use-user'
import { buildArray } from 'common/util/array'
import { RiChatNewFill } from 'react-icons/ri'

export default function NewMessageButton(props: { className?: string }) {
  const [open, setOpen] = useState(false)
  const { className } = props
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true)
        }}
        className="mr-2 items-center lg:mr-0"
        size="xs"
      >
        <Row className="items-center gap-1">
          <RiChatNewFill className="h-4 w-4" aria-hidden="true" />
          New Message
        </Row>
      </Button>
      <MessageModal open={open} setOpen={setOpen} />
    </>
  )
}

function MessageModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen } = props
  const privateUser = usePrivateUser()
  const router = useRouter()

  const [users, setUsers] = useState<DisplayUser[]>([])
  const createChannel = async () => {
    const res = await createPrivateMessageChannelWithUsers({
      userIds: users.map((user) => user.id),
    }).catch((e) => {
      console.error(e)
      return
    })
    if (!res) {
      return
    }
    router.push(`/messages/${res.channelId}`)
  }
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx(MODAL_CLASS, 'h-[20rem] rounded-b-none')}>
        <SelectUsers
          className={'w-full'}
          searchLimit={10}
          setSelectedUsers={setUsers}
          selectedUsers={users}
          ignoreUserIds={users
            .map((user) => user.id)
            .concat(privateUser?.blockedUserIds ?? [])
            .concat(buildArray(privateUser?.id))}
        />
      </Col>
      <Row className={'bg-canvas-0 justify-end rounded-b-md p-2'}>
        <Button disabled={users.length === 0} onClick={createChannel}>
          Create
        </Button>
      </Row>
    </Modal>
  )
}
