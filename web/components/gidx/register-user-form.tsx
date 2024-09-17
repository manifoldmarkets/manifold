import { Col } from 'web/components/layout/col'
import { Input } from 'web/components/widgets/input'
import { Button, buttonClass } from 'web/components/buttons/button'
import {
  ageBlocked,
  identityBlocked,
  locationBlocked,
  PrivateUser,
  User,
} from 'common/user'
import { CountryCodeSelector } from 'web/components/country-code-selector'
import { Row } from 'web/components/layout/row'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useState } from 'react'
import { api, APIError } from 'web/lib/api/api'
import { RegistrationVerifyPhone } from 'web/components/registration-verify-phone'

import { UploadDocuments } from 'web/components/gidx/upload-document'
import Link from 'next/link'
import { useRouter } from 'next/router'

import { usePrivateUser, useUser } from 'web/hooks/use-user'
import {
  ENABLE_FAKE_CUSTOMER,
  FAKE_CUSTOMER_BODY,
  GPSData,
  ID_ERROR_MSG,
} from 'common/gidx/gidx'
import { LocationPanel } from 'web/components/gidx/location-panel'
import { KYC_VERIFICATION_BONUS_CASH } from 'common/economy'
import { CoinNumber } from 'web/components/widgets/coin-number'
import { RegisterIcon } from 'web/public/custom-components/registerIcon'
import {
  BottomRow,
  InputTitle,
} from 'web/components/gidx/register-component-helpers'
import { DocumentUploadIcon } from 'web/public/custom-components/documentUploadIcon'
import { LocationBlockedIcon } from 'web/public/custom-components/locationBlockedIcon'
import { RiUserForbidLine } from 'react-icons/ri'
import { PiClockCountdown } from 'react-icons/pi'

export const RegisterUserForm = (props: {
  user: User
  privateUser: PrivateUser
}) => {
  const user = useUser() ?? props.user
  const privateUser = usePrivateUser() ?? props.privateUser
  const router = useRouter()
  const { redirect } = router.query
  const [page, setPage] = useState(
    user.idVerified || user.kycDocumentStatus === 'pending'
      ? 'final'
      : (redirect === 'checkout' || redirect === 'redeem') &&
        !user.verifiedPhone
      ? 'phone'
      : user.verifiedPhone
      ? 'location'
      : 'intro'
  )
  const [loading, setLoading] = useState(false)
  const [locationError, setLocationError] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [identityErrors, setIdentityErrors] = usePersistentInMemoryState(
    0,
    'gidx-registration-identity-errors'
  )

  const [userInfo, setUserInfo] = usePersistentInMemoryState<{
    FirstName?: string
    LastName?: string
    DateOfBirth?: string
    CitizenshipCountryCode: string
    AddressLine1?: string
    AddressLine2?: string
    City?: string
    StateCode?: string
    PostalCode?: string
    DeviceGPS?: GPSData
    EmailAddress?: string
  }>(
    ENABLE_FAKE_CUSTOMER
      ? {
          ...FAKE_CUSTOMER_BODY,
        }
      : {
          FirstName: user.name.split(' ')[0],
          LastName: user.name.split(' ')[1],
          DateOfBirth: undefined,
          CitizenshipCountryCode: 'US',
          EmailAddress: privateUser.email,
        },
    'gidx-registration-user-info'
  )

  const optionalKeys = ['AddressLine2', 'StateCode']
  const unfilled = Object.entries(userInfo ?? {}).filter(
    ([key, value]) =>
      !optionalKeys.includes(key) && (value === undefined || value === '')
  )
  const register = async () => {
    setError(null)
    setLoading(true)
    if (!userInfo.DeviceGPS) {
      setLoading(false)
      setError('Location is required.')
      return
    }
    if (unfilled.length) {
      setLoading(false)
      setError(`Missing fields: ${unfilled.map(([key]) => key).join(', ')}`)
      return
    }
    const res = await api('register-gidx', {
      MerchantCustomerID: user.id,
      ...userInfo,
    } as any).catch((e) => {
      if (e instanceof APIError) setError(e.message)
      else setError(e)
      setLoading(false)
      return null
    })
    if (!res) return

    const { status, message, idVerified } = res
    setLoading(false)
    if (message && status === 'error' && idVerified) {
      setError(message)
    } else if (message && status === 'error') {
      if (identityErrors >= 2 && page !== 'documents') setPage('documents')
      setIdentityErrors(identityErrors + 1)
      setError(message)
      return
    }
    // Identity verification succeeded
    setPage('final')
  }

  if (page === 'intro') {
    return (
      <>
        <RegisterIcon height={40} className="fill-ink-700 mx-auto" />
        <div className={'mx-auto text-2xl'}>Identity Verification</div>
        <span className="text-ink-700">
          To use sweepstakes coins, you must verify your identity.
        </span>
        <BottomRow>
          <Button color={'gray-white'} onClick={router.back}>
            Back
          </Button>
          <Button color={'indigo'} onClick={() => setPage('phone')}>
            Start verification
          </Button>
        </BottomRow>
      </>
    )
  }

  if (page === 'phone') {
    return (
      <RegistrationVerifyPhone
        cancel={() => setPage('intro')}
        next={() => setPage('location')}
      />
    )
  }

  if (page === 'location') {
    return (
      <LocationPanel
        setLocation={(data: GPSData) => {
          setUserInfo({
            ...userInfo,
            DeviceGPS: data,
          })
          setPage('form')
        }}
        setLocationError={setLocationError}
        setLoading={setLoading}
        loading={loading}
        locationError={locationError}
        back={() => (user.verifiedPhone ? setPage('intro') : setPage('phone'))}
      />
    )
  }

  if (page === 'form') {
    const sectionClass = 'gap-0.5 w-full'
    return (
      <>
        <span className={'mx-auto text-2xl'}>Identity Verification</span>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Col className={sectionClass}>
            <InputTitle>First Name</InputTitle>
            <Input
              placeholder={'Your first name'}
              value={userInfo.FirstName}
              type={'text'}
              onChange={(e) =>
                setUserInfo({ ...userInfo, FirstName: e.target.value })
              }
            />
          </Col>

          <Col className={sectionClass}>
            <InputTitle>Last Name</InputTitle>
            <Input
              placeholder={'Your last name'}
              value={userInfo.LastName}
              type={'text'}
              onChange={(e) =>
                setUserInfo({ ...userInfo, LastName: e.target.value })
              }
            />
          </Col>
        </div>
        <Col className={sectionClass}>
          <InputTitle>Date of Birth</InputTitle>
          <Input
            className={'w-full'}
            type={'date'}
            value={
              userInfo.DateOfBirth && userInfo.DateOfBirth.includes('/')
                ? new Date(userInfo.DateOfBirth).toISOString().split('T')[0]
                : userInfo.DateOfBirth
            }
            onChange={(e) =>
              setUserInfo({ ...userInfo, DateOfBirth: e.target.value })
            }
          />
        </Col>
        <Col className={sectionClass}>
          <InputTitle>Email Address</InputTitle>
          <Input
            placeholder={'Your email address'}
            value={userInfo.EmailAddress}
            type={'text'}
            onChange={(e) =>
              setUserInfo({ ...userInfo, EmailAddress: e.target.value })
            }
          />
        </Col>

        <div className="bg-ink-200 my-4 h-[1px] w-full" />

        <Col className={sectionClass}>
          <InputTitle>Citizenship Country</InputTitle>
          <CountryCodeSelector
            selectedCountry={userInfo.CitizenshipCountryCode}
            setSelectedCountry={(val) =>
              setUserInfo({ ...userInfo, CitizenshipCountryCode: val })
            }
          />
        </Col>

        <Col className={sectionClass}>
          <InputTitle>Address Line 1</InputTitle>
          <Input
            placeholder={'Your address'}
            value={userInfo.AddressLine1}
            type={'text'}
            onChange={(e) =>
              setUserInfo({ ...userInfo, AddressLine1: e.target.value })
            }
          />
        </Col>
        <Col className={sectionClass}>
          <InputTitle>Address Line 2</InputTitle>
          <Input
            placeholder={'Suite, apartment, etc. (optional)'}
            value={userInfo.AddressLine2}
            type={'text'}
            onChange={(e) =>
              setUserInfo({ ...userInfo, AddressLine2: e.target.value })
            }
          />
        </Col>
        <Col className={sectionClass}>
          <InputTitle>City</InputTitle>
          <Input
            placeholder={'Your city'}
            value={userInfo.City}
            type={'text'}
            onChange={(e) => setUserInfo({ ...userInfo, City: e.target.value })}
          />
        </Col>
        <Row className={'gap-4'}>
          <Col className={'w-1/2 '}>
            <InputTitle>State</InputTitle>
            <Input
              placeholder={'Your state'}
              value={userInfo.StateCode}
              type={'text'}
              onChange={(e) =>
                setUserInfo({ ...userInfo, StateCode: e.target.value })
              }
            />
          </Col>
          <Col className={'w-1/2 '}>
            <InputTitle>Postal Code</InputTitle>
            <Input
              placeholder={'Your postal code'}
              value={userInfo.PostalCode}
              type={'text'}
              onChange={(e) =>
                setUserInfo({ ...userInfo, PostalCode: e.target.value })
              }
            />
          </Col>
        </Row>
        {error && (
          <Col className={'text-error'}>
            {error}
            <Row>
              {error === ID_ERROR_MSG ? (
                <Button
                  onClick={() => setPage('documents')}
                  color={'indigo-outline'}
                >
                  Upload documents instead
                </Button>
              ) : (
                ''
              )}
            </Row>
          </Col>
        )}
        <BottomRow>
          <Button
            color={'gray-white'}
            disabled={loading}
            onClick={() => setPage('intro')}
          >
            Back
          </Button>
          <Button
            loading={loading}
            disabled={loading || unfilled.length > 0}
            onClick={register}
          >
            Submit
          </Button>
        </BottomRow>
      </>
    )
  }

  if (page === 'documents') {
    return (
      <>
        <span className={'mx-auto text-2xl'}>
          Identity Document Verification
        </span>
        <UploadDocuments
          back={() => router.back()}
          next={() => setPage('final')}
        />
      </>
    )
  }

  if (user.kycDocumentStatus === 'pending') {
    return (
      <>
        <PiClockCountdown className="fill-ink-700 mx-auto h-40 w-40" />
        <span className={'mx-auto text-2xl'}>Verification pending</span>
        <span className="text-ink-700">
          Thank you for submitting your identification information! Your
          identity verification is pending. Check back later to see if you're
          verified.
        </span>
        <BottomRow>
          <Button
            color={'indigo-outline'}
            loading={loading}
            onClick={async () => {
              setLoading(true)
              await api('get-verification-status-gidx', {})
              setLoading(false)
            }}
          >
            Refresh status
          </Button>
          <Link className={buttonClass('md', 'indigo')} href={'/home'}>
            Done
          </Link>
        </BottomRow>
      </>
    )
  }

  if (identityBlocked(user, privateUser) || ageBlocked(user, privateUser)) {
    return (
      <>
        <RiUserForbidLine className="fill-ink-700 mx-auto h-40 w-40" />
        <span className={'mx-auto text-2xl'}>Blocked identity</span>
        <span className="text-ink-700">
          We verified your identity! But, you're blocked. Unfortunately, this
          means you can't use our sweepstakes markets.
        </span>
        <Row className="mx-auto">
          <Link className={buttonClass('md', 'indigo')} href={'/home'}>
            Go home
          </Link>
        </Row>
      </>
    )
  } else if (locationBlocked(user, privateUser)) {
    return (
      <>
        <LocationBlockedIcon height={40} className="fill-ink-700 mx-auto" />
        <span className={'mx-auto text-2xl'}>Blocked location</span>
        <span className="text-ink-700">
          We verified your identity! But, you're currently in a blocked
          location. Please try again later (more than 3 hrs) in an allowed
          location.
        </span>
        <Row className="mx-auto">
          <Link className={buttonClass('md', 'indigo')} href={'/home'}>
            Go home
          </Link>
        </Row>
      </>
    )
  }

  if (user.sweepstakesVerified === false || user.kycDocumentStatus === 'fail') {
    return (
      <>
        <DocumentUploadIcon
          className="fill-ink-700 mx-auto my-auto -mb-6"
          height={40}
        />
        <span className={'mx-auto text-2xl'}>Document upload</span>
        <span className="text-ink-700 mx-auto">
          {user.kycDocumentStatus === 'fail' &&
            'There were errors with your documents. '}
          Please upload identity documents to continue.
        </span>
        <Row className="mx-auto">
          <Button onClick={() => setPage('documents')}>Continue</Button>
        </Row>
      </>
    )
  }

  return (
    <>
      <div className="mx-auto text-[130px] ">🎉</div>
      <span className={'mx-auto text-2xl'}>
        Identity Verification Complete!
      </span>
      <span className="text-ink-700">
        Hooray! Now you can participate in sweepstakes markets. We sent you{' '}
        <CoinNumber
          amount={Math.max(user.cashBalance, KYC_VERIFICATION_BONUS_CASH)}
          className={'font-bold'}
          coinType={'CASH'}
          isInline={true}
        />{' '}
        to get started.
      </span>
      <div className="mx-auto">
        {/*// TODO:  auto-redirect rather than make them click this button*/}
        {redirect === 'checkout' ? (
          <Link className={buttonClass('md', 'indigo')} href={'/checkout'}>
            Get mana
          </Link>
        ) : redirect === 'redeem' ? (
          <Link className={buttonClass('md', 'indigo')} href={'/redeem'}>
            Redeem
          </Link>
        ) : (
          <Link className={buttonClass('md', 'indigo')} href={'/home'}>
            Done
          </Link>
        )}
      </div>
    </>
  )
}
