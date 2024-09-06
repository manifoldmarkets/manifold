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

import { usePrivateUser, useWebsocketUser } from 'web/hooks/use-user'
import {
  ENABLE_FAKE_CUSTOMER,
  FAKE_CUSTOMER_BODY,
  GPSData,
  ID_ERROR_MSG,
} from 'common/gidx/gidx'
import { LocationPanel } from 'web/components/gidx/location-panel'

export const registrationColClass = 'gap-3 p-4'
export const registrationBottomRowClass = 'mb-4 mt-4 w-full gap-16'

export const RegisterUserForm = (props: {
  user: User
  privateUser: PrivateUser
}) => {
  const user = useWebsocketUser(props.user.id) ?? props.user
  const privateUser = usePrivateUser() ?? props.privateUser
  const router = useRouter()
  const { redirect } = router.query
  const [page, setPage] = useState(
    user.idVerified || user.kycDocumentStatus === 'pending'
      ? 'final'
      : (redirect === 'checkout' || redirect === 'cashout') &&
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
      <Col className={registrationColClass}>
        <span className={'text-primary-700 text-2xl'}>
          Identity Verification
        </span>
        <span>To use sweepstakes coins, you must verify your identity.</span>
        <Row className={registrationBottomRowClass}>
          <Button color={'gray-white'} onClick={router.back}>
            Back
          </Button>
          <Button color={'indigo'} onClick={() => setPage('phone')}>
            Start verification
          </Button>
        </Row>
      </Col>
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
    const sectionClass = 'gap-2 w-full sm:w-96'
    return (
      <Col className={registrationColClass}>
        <span className={'text-primary-700 text-2xl'}>
          Identity Verification
        </span>
        <Col className={sectionClass}>
          <span>First Name</span>
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
          <span>Last Name</span>
          <Input
            placeholder={'Your last name'}
            value={userInfo.LastName}
            type={'text'}
            onChange={(e) =>
              setUserInfo({ ...userInfo, LastName: e.target.value })
            }
          />
        </Col>
        <Col className={sectionClass}>
          <span>Date of Birth</span>
          <Input
            className={'w-40'}
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
          <span>Citizenship Country</span>
          <CountryCodeSelector
            selectedCountry={userInfo.CitizenshipCountryCode}
            setSelectedCountry={(val) =>
              setUserInfo({ ...userInfo, CitizenshipCountryCode: val })
            }
          />
        </Col>
        <Col className={sectionClass}>
          <span>Address Line 1</span>
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
          <span>Address Line 2</span>
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
          <span>Email Address</span>
          <Input
            placeholder={'Your email address'}
            value={userInfo.EmailAddress}
            type={'text'}
            onChange={(e) =>
              setUserInfo({ ...userInfo, EmailAddress: e.target.value })
            }
          />
        </Col>
        <Row className={'gap-2 sm:gap-8'}>
          <Col className={'w-1/2 sm:w-44'}>
            <span>City</span>
            <Input
              placeholder={'Your city'}
              value={userInfo.City}
              type={'text'}
              onChange={(e) =>
                setUserInfo({ ...userInfo, City: e.target.value })
              }
            />
          </Col>
          <Col className={'w-1/2 pr-2 sm:w-44 sm:pr-0'}>
            <span>State</span>
            <Input
              placeholder={'Your state'}
              value={userInfo.StateCode}
              type={'text'}
              onChange={(e) =>
                setUserInfo({ ...userInfo, StateCode: e.target.value })
              }
            />
          </Col>
        </Row>
        <Col className={'w-1/2 sm:w-44'}>
          <span>Postal Code</span>
          <Input
            placeholder={'Your postal code'}
            value={userInfo.PostalCode}
            type={'text'}
            onChange={(e) =>
              setUserInfo({ ...userInfo, PostalCode: e.target.value })
            }
          />
        </Col>

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
        <Row className={registrationBottomRowClass}>
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
        </Row>
      </Col>
    )
  }

  if (page === 'documents') {
    return (
      <Col className={registrationColClass}>
        <span className={'text-primary-700 text-2xl'}>
          Identity Document Verification
        </span>
        <UploadDocuments
          back={() => router.back()}
          next={() => setPage('final')}
        />
      </Col>
    )
  }

  if (user.kycDocumentStatus === 'pending') {
    return (
      <Col className={registrationColClass}>
        <span className={'text-primary-700 text-2xl'}>
          Verification pending
        </span>
        Thank you for submitting your identification information! Your identity
        verification is pending. Check back later to see if you're verified.
        <Row className={registrationBottomRowClass}>
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
        </Row>
      </Col>
    )
  }

  if (identityBlocked(user, privateUser) || ageBlocked(user, privateUser)) {
    return (
      <Col className={registrationColClass}>
        <span className={'text-primary-700 text-2xl'}>Blocked identity</span>
        <span>
          We verified your identity! But, you're blocked. Unfortunately, this
          means you can't use our sweepstakes markets.
        </span>
      </Col>
    )
  } else if (locationBlocked(user, privateUser)) {
    return (
      <Col className={registrationColClass}>
        <span className={'text-primary-700 text-2xl'}>Blocked location</span>
        <span>
          We verified your identity! But, you're currently in a blocked
          location. Please try again later ({'>'}3 hrs) in an allowed location.
        </span>
      </Col>
    )
  }

  if (user.sweepstakesVerified === false || user.kycDocumentStatus === 'fail') {
    return (
      <Col className={registrationColClass}>
        <span className={'text-primary-700 text-2xl'}>Document errors</span>
        <span>
          There was an error with your registration. Please upload identity
          documents.
        </span>
        <Row className={registrationBottomRowClass}>
          <Button onClick={() => setPage('documents')}>Upload documents</Button>
        </Row>
      </Col>
    )
  }

  return (
    <Col className={registrationColClass}>
      <span className={'text-primary-700 text-2xl'}>
        Identity Verification Complete
      </span>
      Thank you for verifying your identity! Now you can cash out prize points.
      <Row className={registrationBottomRowClass}>
        {/*// TODO:  auto-redirect rather than make them click this button*/}
        {redirect === 'checkout' ? (
          <Link className={buttonClass('md', 'indigo')} href={'/checkout'}>
            Get mana
          </Link>
        ) : redirect === 'cashout' ? (
          <Link className={buttonClass('md', 'indigo')} href={'/cashout'}>
            Cash out
          </Link>
        ) : (
          <Link className={buttonClass('md', 'indigo')} href={'/home'}>
            Done
          </Link>
        )}
      </Row>
    </Col>
  )
}
