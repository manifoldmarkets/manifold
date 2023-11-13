import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { Notification } from 'common/notification'
import { NotificationUserLink } from './notifications/notification-helpers'

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
        {similarNotifications.map((notif) => (
          <Row
            key={notif.sourceUserUsername + 'list'}
            className="w-full items-center gap-2"
          >
            <Avatar
              username={notif.sourceUserUsername}
              avatarUrl={notif.sourceUserAvatarUrl}
            />
            <NotificationUserLink
              name={notif.sourceUserName}
              username={notif.sourceUserUsername}
            />
          </Row>
        ))}
      </Col>
    </Modal>
  )
}
