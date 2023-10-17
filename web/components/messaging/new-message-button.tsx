import { PlusIcon } from '@heroicons/react/solid'
import { Button } from '../buttons/button'
import { useState } from 'react'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { Col } from '../layout/col'
import { SupabaseSearch } from '../supabase-search'
import { User } from 'common/user'
import { createPrivateMessageChannelWithUser } from 'web/lib/firebase/api'
import { useRouter } from 'next/router'
import clsx from 'clsx'

export default function NewMessageButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button className="h-fit gap-1" onClick={() => setOpen(true)}>
        <PlusIcon className="h-5 w-5" aria-hidden="true" />
        New Message
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
  const router = useRouter()
  const [loadingUserId, setLoadingUserId] = useState<string | undefined>(
    undefined
  )

  const createChannel = async (user: User) => {
    setLoadingUserId(user.id) // Set the clicked user's ID
    const res = await createPrivateMessageChannelWithUser({
      userId: user.id,
    }).catch((e) => {
      setLoadingUserId(undefined)
      return
    })
    if (!res) {
      setLoadingUserId(undefined)
      return
    }
    router.push(`/messages/${res.channelId}`)
  }
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx(MODAL_CLASS, 'h-[40rem] overflow-scroll')}>
        <div className="bg-canvas-0 rounded-t- absolute top-0 h-20 w-full rounded-t-md" />
        <SupabaseSearch
          persistPrefix="message-search"
          headerClassName={'pt-0'}
          defaultSearchType="Users"
          hideContractFilters
          hideSearchTypes
          userResultProps={{
            onUserClick: (user: User) => {
              createChannel(user)
            },
            showFollowButton: false,
            loadingUserId: loadingUserId,
          }}
        />
      </Col>
    </Modal>
  )
}
