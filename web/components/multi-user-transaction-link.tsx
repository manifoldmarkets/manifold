import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { formatMoney } from 'common/lib/util/format'
import { Avatar } from 'web/components/avatar'
import { UserLink } from 'web/components/user-link'
import { Button } from 'web/components/button'

export type MultiUserLinkInfo = {
  name: string
  username: string
  avatarUrl: string | undefined
  amount: number
}

export function MultiUserTransactionLink(props: {
  userInfos: MultiUserLinkInfo[]
  modalLabel: string
}) {
  const { userInfos, modalLabel } = props
  const [open, setOpen] = useState(false)
  const maxShowCount = 5
  return (
    <Row>
      <Button
        size={'xs'}
        color={'gray-white'}
        className={'z-10 mr-1 gap-1 bg-transparent'}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        <Row className={'gap-1'}>
          {userInfos.map((userInfo, index) =>
            index < maxShowCount ? (
              <Row key={userInfo.username + 'shortened'}>
                <Avatar
                  username={userInfo.username}
                  size={'sm'}
                  avatarUrl={userInfo.avatarUrl}
                  noLink={userInfos.length > 1}
                />
              </Row>
            ) : (
              <span>& {userInfos.length - maxShowCount} more</span>
            )
          )}
        </Row>
      </Button>
      <Modal open={open} setOpen={setOpen} size={'sm'}>
        <Col className="items-start gap-4 rounded-md bg-white p-6">
          <span className={'text-xl'}>{modalLabel}</span>
          {userInfos.map((userInfo) => (
            <Row
              key={userInfo.username + 'list'}
              className="w-full items-center gap-2"
            >
              <span className="text-primary min-w-[3.5rem]">
                +{formatMoney(userInfo.amount)}
              </span>
              <Avatar
                username={userInfo.username}
                avatarUrl={userInfo.avatarUrl}
              />
              <UserLink name={userInfo.name} username={userInfo.username} />
            </Row>
          ))}
        </Col>
      </Modal>
    </Row>
  )
}
