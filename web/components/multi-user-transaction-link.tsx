import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { Notification } from 'common/notification'

export type MultiUserLinkInfo = {
  name: string
  username: string
  avatarUrl: string | undefined
  amount?: number
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

export function MultiUserTransactionModal(props: {
  userInfos: MultiUserLinkInfo[]
  modalLabel: string
  open: boolean
  setOpen: (open: boolean) => void
  short?: boolean
}) {
  const { userInfos, modalLabel, open, setOpen, short } = props
  const hasUsers = userInfos.length > 0
  return (
    <Modal open={open} setOpen={setOpen} size={'sm'}>
      <Col className="relative items-start gap-4 rounded-md bg-white p-6">
        <span className={'sticky top-0 text-xl'}>{modalLabel}</span>
        {hasUsers && (
          <Col className="max-h-96 w-full gap-4 overflow-y-auto">
            {userInfos.map((userInfo) => (
              <Row
                key={userInfo.username + 'list'}
                className="w-full items-center gap-2"
              >
                {userInfo.amount && (
                  <span className="min-w-[3.5rem] text-teal-500">
                    +{formatMoney(userInfo.amount)}
                  </span>
                )}
                <Avatar
                  username={userInfo.username}
                  avatarUrl={userInfo.avatarUrl}
                  size={'sm'}
                />
                <UserLink
                  name={userInfo.name}
                  username={userInfo.username}
                  short={short}
                />
              </Row>
            ))}
          </Col>
        )}
        {!hasUsers && <div>No one yet...</div>}
      </Col>
    </Modal>
  )
}
