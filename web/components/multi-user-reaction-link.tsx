import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { Notification } from 'common/notification'

export function MultiUserReactionModal(props: {
  similarNotifications: Notification[]
  modalLabel: string
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { similarNotifications, modalLabel, open, setOpen } = props
  return (
    <Modal open={open} setOpen={setOpen} size={'sm'}>
      <Col className="bg-canvas-0 items-start gap-4 rounded-md p-6">
        <span className={'text-xl'}>{modalLabel}</span>
        {similarNotifications.map((userInfo) => (
          <Row
            key={userInfo.sourceUserUsername + 'list'}
            className="w-full items-center gap-2"
          >
            <Avatar
              username={userInfo.sourceUserUsername}
              avatarUrl={userInfo.sourceUserAvatarUrl}
            />
            <UserLink
              name={userInfo.sourceUserName}
              username={userInfo.sourceUserUsername}
            />
          </Row>
        ))}
      </Col>
    </Modal>
  )
}
