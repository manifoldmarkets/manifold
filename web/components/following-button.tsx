import { User } from 'common/user'
import { useState } from 'react'
import { useFollows } from 'web/hooks/use-follows'
import { FollowList } from './follow-list'
import { Col } from './layout/col'
import { Modal } from './layout/modal'

export function FollowingButton(props: { user: User }) {
  const { user } = props
  const [open, setOpen] = useState(false)
  const followingUserIds = useFollows(user.id)

  return (
    <>
      <div
        className="cursor-pointer gap-2 hover:underline"
        tabIndex={0}
        onClick={() => setOpen(true)}
      >
        <span className="font-semibold">{followingUserIds?.length ?? ''}</span>{' '}
        Following
      </div>

      <Modal open={open} setOpen={setOpen}>
        <Col className="rounded bg-white p-6">
          <div className="p-2 text-xl ">{user.name} is following</div>
          <FollowList userIds={followingUserIds ?? []} />
        </Col>
      </Modal>
    </>
  )
}
