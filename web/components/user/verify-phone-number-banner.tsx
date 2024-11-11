import { PHONE_VERIFICATION_BONUS } from 'common/economy'
import { humanish, User } from 'common/user'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { OnboardingVerifyPhone } from 'web/components/onboarding-verify-phone'
import { CoinNumber } from 'web/components/widgets/coin-number'
import { useUser } from 'web/hooks/use-user'

export const VerifyPhoneNumberBanner = (props: {
  user: User | null | undefined
}) => {
  const user = useUser() ?? props.user

  const [showVerifyPhone, setShowVerifyPhone] = useState(false)
  if (!user || humanish(user)) return null
  return (
    <Col
      className={
        'border-primary-500 bg-primary-100 items-center justify-between gap-2 rounded border p-2 px-4 sm:flex-row'
      }
    >
      <span>Verify your phone number. </span>
      <Button
        className={'w-full whitespace-nowrap font-semibold sm:w-fit'}
        onClick={() => setShowVerifyPhone(true)}
        color="violet"
      >
        Verify and claim&nbsp;
        <CoinNumber
          amount={PHONE_VERIFICATION_BONUS}
          className={'font-bold'}
          isInline
        />
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
        <OnboardingVerifyPhone onClose={() => setOpen(false)} />
      </Col>
    </Modal>
  )
}
