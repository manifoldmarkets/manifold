import { humanish, User } from 'common/user'
import { PHONE_VERIFICATION_BONUS } from 'common/economy'
import { Button } from 'web/components/buttons/button'
import { useState } from 'react'
import { OnboardingVerifyPhone } from 'web/components/onboarding-verify-phone'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { CoinNumber } from 'web/components/widgets/coin-number'
import { useUser } from 'web/hooks/use-user'
import { TWOMBA_ENABLED } from 'common/envs/constants'

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
      <span>
        {TWOMBA_ENABLED
          ? 'Verify your phone number'
          : `Prove that you're not a robot`}
        .{' '}
      </span>
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
