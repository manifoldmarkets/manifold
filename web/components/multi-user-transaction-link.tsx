import { formatMoney } from 'common/util/format'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'

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
      <MultiUserTransactionModal
        userInfos={userInfos}
        modalLabel={modalLabel}
        open={open}
        setOpen={setOpen}
      />
    </span>
  )
}

export function MultiUserTransactionModal(props: {
  userInfos: MultiUserLinkInfo[]
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
  )
}
