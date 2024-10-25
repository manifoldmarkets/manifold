import { Col } from 'web/components/layout/col'
import { Input } from 'web/components/widgets/input'
import { Button, buttonClass } from 'web/components/buttons/button'
import { PrivateUser, User } from 'common/user'
import { Row } from 'web/components/layout/row'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useEffect, useState } from 'react'
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
  Divider,
  InputTitle,
} from 'web/components/gidx/register-component-helpers'
import { DocumentUploadIcon } from 'web/public/custom-components/documentUploadIcon'
import { LocationBlockedIcon } from 'web/public/custom-components/locationBlockedIcon'
import { RiUserForbidLine } from 'react-icons/ri'
import { PiClockCountdown } from 'react-icons/pi'
import { track } from 'web/lib/service/analytics'
import {
  ageBlocked,
  documentPending,
  fraudSession,
  identityBlocked,
  locationBlocked,
} from 'common/gidx/user'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { CheckCircleIcon } from '@heroicons/react/solid'
import clsx from 'clsx'

export const RegisterUserForm = (props: {
  user: User
  privateUser: PrivateUser
}) => {
  const user = useUser() ?? props.user
  const privateUser = usePrivateUser() ?? props.privateUser
  const router = useRouter()
  const { redirect } = router.query
  const [page, setPage] = useState(
    user.idVerified ||
      user.kycDocumentStatus === 'pending' ||
      user.kycDocumentStatus === 'fail'
      ? 'final'
      : (redirect === 'checkout' || redirect === 'redeem') &&
        !user.verifiedPhone
      ? 'phone'
      : user.verifiedPhone
      ? 'location'
      : 'intro'
  )
  const [initialUserState, _] = useState(props.user)

  // Used for ads conversion tracking
  useEffect(() => {
    if (
      !initialUserState.idVerified &&
      initialUserState.kycDocumentStatus === 'await-documents' &&
      (user.idVerified || user.kycDocumentStatus === 'pending') &&
      !router.query.complete
    ) {
      router.push({
        pathname: router.pathname,
        query: { ...router.query, complete: 'true' },
      })
    }
  }, [user.idVerified, user.kycDocumentStatus, initialUserState, router])

  const [loading, setLoading] = useState(false)
  const [locationError, setLocationError] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [identityErrors, setIdentityErrors] = usePersistentInMemoryState(
    0,
    'gidx-registration-identity-errors'
  )

  const userSuccesfullyVerified =
    user.idVerified &&
    !documentPending(user, privateUser) &&
    !identityBlocked(user, privateUser) &&
    !ageBlocked(user, privateUser) &&
    !locationBlocked(user, privateUser) &&
    !fraudSession(user, privateUser) &&
    page === 'final'
  const TIME_TO_REDIRECT = 4000

  useEffect(() => {
    if (userSuccesfullyVerified) {
      setTimeout(() => {
        router.push('/checkout')
      }, TIME_TO_REDIRECT)
    }
  }, [userSuccesfullyVerified, router])

  const [userInfo, setUserInfo] = usePersistentInMemoryState<{
    FirstName?: string
    LastName?: string
    DateOfBirth?: string
    AddressLine1?: string
    AddressLine2?: string
    City?: string
    StateCode?: string
    PostalCode?: string
    DeviceGPS?: GPSData
    EmailAddress?: string
    ReferralCode?: string
  }>(
    ENABLE_FAKE_CUSTOMER
      ? {
          ...FAKE_CUSTOMER_BODY,
        }
      : {
          FirstName: user.name.split(' ')[0],
          LastName: user.name.split(' ')[1],
          DateOfBirth: undefined,
          EmailAddress: privateUser.email,
        },
    'gidx-registration-user-info'
  )

  useEffect(() => {
    track('register user gidx page change', {
      page,
    })
  }, [page])

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
  const [canContinue, setCanContinue] = useState(false)

  const [formPage, setFormPage] = useState(1)

  if (page === 'intro') {
    return (
      <>
        <RegisterIcon height={40} className="fill-ink-700 mx-auto" />
        <div className={'mx-auto text-2xl'}>Identity Verification</div>
        <Col className="text-ink-700">
          <Row className="p-4">
            <Col>
              <Row className="items-center">
                <span className="mr-2 text-indigo-600">
                  <CheckCircleIcon className="h-6 w-6" />
                </span>
                <span>
                  To participate in sweepstakes and comply with U.S. laws, you
                  must verify your identity.
                </span>
              </Row>
            </Col>
          </Row>
          <Row className="p-4">
            <Col>
              <Row className="items-center">
                <span className="mr-2 text-indigo-600">
                  <CheckCircleIcon className="h-6 w-6" />
                </span>
                <span>
                  Manifold uses a verification platform to validate your name,
                  phone number, birthday, and address.
                </span>
              </Row>
            </Col>
          </Row>
          <Row className="p-4">
            <Col>
              <Row className="items-center">
                <span className="mr-2 text-indigo-600">
                  <CheckCircleIcon className="h-6 w-6" />
                </span>
                <span>
                  Your info is confidential, securely protected, and used solely
                  for regulatory purposes.
                </span>
              </Row>
            </Col>
          </Row>
        </Col>
        <span className="text-ink-700">
          <input
            type="checkbox"
            checked={canContinue}
            onChange={(e) => setCanContinue(e.target.checked)}
            className="bg-canvas-0 mb-1 mr-2"
          />
          <span className="">
            I am a resident of the United States (excluding DE, ID, MI, and WA)
            and over 18 years old.
          </span>
        </span>
        <BottomRow>
          <Button color={'gray-white'} onClick={() => router.push('/home')}>
            Cancel
          </Button>
          <Button
            color={'indigo'}
            onClick={() => setPage('phone')}
            disabled={!canContinue}
          >
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

 

  if (page === 'documents') {
    return (
      <>
        <span className={'mx-auto text-2xl'}>
          Identity Document Verification
        </span>
        <UploadDocuments
          back={() => router.back()}
          next={() => setPage('final')}
          requireUtilityDoc={false}
        />
      </>
    )
  }

  if (documentPending(user, privateUser)) {
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
  } else if (
    identityBlocked(user, privateUser) ||
    ageBlocked(user, privateUser)
  ) {
    return (
      <>
        <RiUserForbidLine className="fill-ink-700 mx-auto h-40 w-40" />
        <span className={'mx-auto text-2xl'}>
          {identityBlocked(user, privateUser) ? 'Blocked identity' : 'Underage'}
        </span>
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
  } else if (fraudSession(user, privateUser)) {
    return (
      <>
        <div className="mx-auto text-[130px] ">🎉</div>
        <span className={'mx-auto text-2xl'}>
          Identity Verification Complete!
        </span>
        <span className="text-ink-700">
          Your session is marked as possible fraud, however. Please turn off VPN
          if using
        </span>
        <Row className="mx-auto">
          <Link className={buttonClass('md', 'indigo')} href={'/home'}>
            Go home
          </Link>
        </Row>
      </>
    )
  }
  if (
    !user.idVerified &&
    (user.kycDocumentStatus === 'fail' ||
      user.kycDocumentStatus === 'await-documents')
  ) {
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
          Please upload a photo of your id to continue.
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
      <Row className="text-ink-700 mx-auto items-center gap-2">
        <LoadingIndicator /> Exiting through the gift shop...
      </Row>
    </>
  )
}
