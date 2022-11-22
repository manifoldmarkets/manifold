import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { formatMoney } from 'common/util/format'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { Button } from 'web/components/buttons/button'

export type MultiUserLinkInfo = {
  name: string
  username: string
  avatarUrl: string | undefined
  amount: number
}

export function MultiUserTransactionLink(props: {
  userInfos: MultiUserLinkInfo[]
  modalLabel: string
  text: string
}) {
  const { userInfos, modalLabel, text } = props
  const [open, setOpen] = useState(false)
  const maxShowCount = 5
  return (
    <span>
      <button
        className={
          'bg-transparent font-semibold transition-colors hover:text-indigo-500'
        }
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {text}
      </button>
      <Modal open={open} setOpen={setOpen} size={'sm'}>
        <Col className="items-start gap-4 rounded-md bg-white p-6">
          <span className={'text-xl'}>{modalLabel}</span>
          {userInfos.map((userInfo) => (
            <Row
              key={userInfo.username + 'list'}
              className="w-full items-center gap-2"
            >
              <span className="min-w-[3.5rem] text-teal-500">
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
    </span>
  )
}
