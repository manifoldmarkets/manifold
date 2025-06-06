import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { PhoneIcon } from 'web/public/custom-components/phoneIcon'
import { BottomRow } from './gidx/register-component-helpers'
import { Row } from './layout/row'
import { StyledPhoneInput } from './onboarding-verify-phone'

export function RegistrationVerifyPhone(props: {
  cancel: () => void
  next: () => void
}) {
  const { next, cancel } = props
  const user = useUser()
  const requestOTP = async () => {
    setLoading(true)
    await toast
      .promise(
        api('request-otp', {
          phoneNumber,
        }),
        {
          loading: 'Sending code to your phone...',
          success: 'Code sent! Check your phone.',
          error: (e) => e.message,
        }
      )
      .then(() => setPage(1))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }

  const verifyPhone = async () => {
    setLoading(true)

    await toast
      .promise(
        api('verify-phone-number', {
          phoneNumber,
          code: otp,
        }),
        {
          loading: 'Verifying code...',
          success: 'Phone verified!',
          error: (e) => e.message,
        }
      )
      .then(next)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
    track('verify phone')
  }
  const [loading, setLoading] = useState(false)
  const [otp, setOtp] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [page, setPage] = useState(0)
  useEffect(() => {
    if (user?.verifiedPhone) next()
  }, [user?.verifiedPhone])

  return (
    <>
      {page === 0 && (
        <>
          <PhoneIcon height={40} className="fill-ink-700 mx-auto" />
          <span className={'mx-auto text-2xl'}>Verify your phone number</span>
          <Row className="text-ink-700 pl-5 text-sm">
            We won't use your phone number for anything other than verification.
          </Row>
          <StyledPhoneInput
            phoneNumber={phoneNumber}
            setPhoneNumber={setPhoneNumber}
          />
          <BottomRow>
            <Button color={'gray-white'} onClick={cancel}>
              Back
            </Button>
            <Button
              disabled={phoneNumber.length < 7 || loading}
              loading={loading}
              onClick={requestOTP}
            >
              Request code
            </Button>
          </BottomRow>
        </>
      )}
      {page === 1 && (
        <>
          <PhoneIcon height={40} className="fill-ink-700 mx-auto" />
          <span className={'mx-auto text-2xl'}>Enter verification code</span>
          <Input
            className={'mx-auto mb-1.5 w-36 text-base'}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="123456"
          />
          <BottomRow>
            <Button color={'gray-white'} onClick={() => setPage(0)}>
              Back
            </Button>
            <Button
              disabled={otp.length < 6 || loading}
              loading={loading}
              onClick={verifyPhone}
            >
              Verify
            </Button>
          </BottomRow>
        </>
      )}
    </>
  )
}
