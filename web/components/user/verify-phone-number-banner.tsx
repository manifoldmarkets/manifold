import { isVerified, User } from 'common/user'
import { STARTING_BALANCE } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { useState } from 'react'
import { VerifyPhone } from 'web/components/verify-phone'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'

export const VerifyPhoneNumberBanner = (props: {
  user: User | null | undefined
}) => {
  const { user } = props
  const [showVerifyPhone, setShowVerifyPhone] = useState(false)
  if (!user || isVerified(user)) return null
  return (
    <Col
      className={
        'border-ink-400 mx-4 my-2 items-center justify-between gap-2 rounded-sm border bg-indigo-200 p-2 dark:bg-indigo-700 sm:flex-row'
      }
    >
      <span>
        Verify your phone number to collect{' '}
        <span className={'font-bold text-teal-500'}>
          {formatMoney(STARTING_BALANCE)}
        </span>
        .{' '}
        <span className={'italic'}>
          (We won't send you any other messages.)
        </span>
      </span>
      <Button
        className={'whitespace-nowrap'}
        onClick={() => setShowVerifyPhone(true)}
      >
        Claim {formatMoney(STARTING_BALANCE)}
      </Button>
      <VerifyPhoneModal open={showVerifyPhone} setOpen={setShowVerifyPhone} />
    </Col>
  )
}
export const VerifyPhoneModal = (props: {
  open: boolean
  setOpen: (open: boolean) => void
}) => {
  const { open, setOpen } = props
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={'bg-canvas-0 p-4'}>
        <VerifyPhone onClose={() => setOpen(false)} />
      </Col>
    </Modal>
  )
}
