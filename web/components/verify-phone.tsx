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

export function VerifyPhone(props: { onClose: () => void }) {
  const { onClose } = props
  const requestOTP = async () => {
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
  }

  const verifyPhone = async () => {
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
  }
  const [otp, setOtp] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [page, setPage] = useState(0)

  return (
    <Col className="text-lg">
      {page === 0 && (
        <Col className="items-center justify-center gap-2">
          <Title>Verify your phone number</Title>
          <span className={'text-ink-700 mb-4 text-center'}>
            We require all users to verify a phone number to prevent account
            abuse.
            <br />
            <br />
            <span className={'italic'}>
              We won't send you any other messages, this is just for
              verification.
            </span>
          </span>
          <PhoneInput
            defaultCountry={'us'}
            value={phoneNumber}
            onChange={(phone) => setPhoneNumber(phone)}
            placeholder={'Phone Number'}
            className={'mb-4'}
          />

          <Button disabled={phoneNumber.length < 12} onClick={requestOTP}>
            Request code
          </Button>
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
            <Button disabled={otp.length < 6} onClick={verifyPhone}>
              Verify code
            </Button>
          </Row>
        </Col>
      )}
    </Col>
  )
}
