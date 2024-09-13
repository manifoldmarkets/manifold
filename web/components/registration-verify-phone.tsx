import { Col } from 'web/components/layout/col'
import { Button } from 'web/components/buttons/button'
import { api } from 'web/lib/api/api'
import { useEffect, useState } from 'react'
import { Input } from 'web/components/widgets/input'
import { PhoneInput } from 'react-international-phone'
import { toast } from 'react-hot-toast'
import 'react-international-phone/style.css'
import { Row } from 'web/components/layout/row'
import { track } from 'web/lib/service/analytics'
import { useUser } from 'web/hooks/use-user'
import { registrationBottomRowClass } from './gidx/register-user-form'
import { PhoneIcon } from 'web/public/custom-components/phoneIcon'

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
          <PhoneInput
            defaultCountry={'us'}
            value={phoneNumber}
            onChange={(phone) => setPhoneNumber(phone)}
            placeholder={'Phone Number'}
            className={'mx-auto'}
          />
          <Row className={registrationBottomRowClass}>
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
          </Row>
        </>
      )}
      {page === 1 && (
        <>
          <PhoneIcon height={40} className="fill-ink-700 mx-auto" />
          <span className={'mx-auto text-2xl'}>Enter verification code</span>
          <Input
            className={'mx-auto w-36 text-base'}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="123456"
          />
          <Row className={registrationBottomRowClass}>
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
          </Row>
        </>
      )}
    </>
  )
}
