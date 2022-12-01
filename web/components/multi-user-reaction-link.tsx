import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'

export type MultiUserReactionInfo = {
  name: string
  username: string
  avatarUrl: string
  reaction: string
}

export function MultiUserReactionModal(props: {
  userInfos: MultiUserReactionInfo[]
  modalLabel: string
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { userInfos, modalLabel, open, setOpen } = props
  return (
    <Modal open={open} setOpen={setOpen} size={'sm'}>
      <Col className="items-start gap-4 rounded-md bg-white p-6">
        <span className={'text-xl'}>{modalLabel}</span>
        {userInfos.map((userInfo) => (
          <Row
            key={userInfo.username + 'list'}
            className="w-full items-center gap-2"
          >
            <Avatar
              username={userInfo.username}
              avatarUrl={userInfo.avatarUrl}
            />
            <UserLink name={userInfo.name} username={userInfo.username} />
          </Row>
        ))}
      </Col>
    </Modal>
  )
}
