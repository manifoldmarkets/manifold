import { Col } from 'web/components/layout/col'
import { Button } from 'web/components/buttons/button'
import { api } from 'web/lib/firebase/api'
import { useState } from 'react'
import { Input } from 'web/components/widgets/input'
import { PhoneInput } from 'react-international-phone'
import { toast } from 'react-hot-toast'
import 'react-international-phone/style.css'
import { Title } from 'web/components/widgets/title'
import { Row } from 'web/components/layout/row'
import { STARTING_BALANCE } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { track } from 'web/lib/service/analytics'

export function VerifyPhone(props: { onClose: () => void }) {
  const { onClose } = props
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
      .then(() => onClose())
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))

    await track('verify phone')
  }
  const [loading, setLoading] = useState(false)
  const [otp, setOtp] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [page, setPage] = useState(0)

  return (
    <Col className="text-lg">
      {page === 0 && (
        <Col className="items-center justify-center gap-2">
          <Title>🤖 Prove you're not a robot 🤖</Title>
          <span className={'-mt-2 mb-2 text-center'}>
            Verify your phone number to collect your{' '}
            <span className={'font-bold text-teal-500'}>
              {formatMoney(STARTING_BALANCE)}
            </span>{' '}
            signup bonus.
            <br />
            <br />
            <span className={'italic'}>
              (We won't send you any other messages.)
            </span>
          </span>
          <PhoneInput
            defaultCountry={'us'}
            value={phoneNumber}
            onChange={(phone) => setPhoneNumber(phone)}
            placeholder={'Phone Number'}
            className={'mb-4'}
          />
          <Row
            className={
              'mb-4 mt-4 w-full justify-between px-8 sm:mt-8 sm:justify-center sm:gap-8'
            }
          >
            <Button color={'gray-white'} onClick={onClose}>
              Skip
            </Button>
            <Button
              disabled={phoneNumber.length < 7 || loading}
              loading={loading}
              onClick={requestOTP}
            >
              Request code
            </Button>
          </Row>
        </Col>
      )}
      {page === 1 && (
        <Col className="h-full items-center justify-between gap-2 sm:justify-start">
          <Col className={'gap-2'}>
            <Title>Enter verification code</Title>

            <Input
              className={'w-36 self-center'}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
            />
          </Col>
          <Row
            className={
              'mb-4 mt-4 w-full justify-between px-8 sm:mt-8 sm:justify-center sm:gap-8'
            }
          >
            <Button color={'gray-white'} onClick={() => setPage(0)}>
              Back
            </Button>
            <Button
              disabled={otp.length < 6 || loading}
              loading={loading}
              onClick={verifyPhone}
            >
              Verify & claim {formatMoney(STARTING_BALANCE)}
            </Button>
          </Row>
        </Col>
      )}
    </Col>
  )
}
