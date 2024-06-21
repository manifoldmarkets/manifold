import { Col } from 'web/components/layout/col'
import { Input } from 'web/components/widgets/input'
import { Button, buttonClass } from 'web/components/buttons/button'
import { User } from 'common/user'
import { CountryCodeSelector } from 'web/components/country-code-selector'
import { Row } from 'web/components/layout/row'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useState } from 'react'
import { api, APIError } from 'web/lib/firebase/api'
import { RegistrationVerifyPhone } from 'web/components/registration-verify-phone'
import {
  hasIdentityError,
  locationBlockedCodes,
  locationTemporarilyBlockedCodes,
  timeoutCodes,
  underageErrorCodes,
} from 'common/reason-codes'
import { intersection } from 'lodash'
import Script from 'next/script'
import { UploadDocuments } from 'web/components/gidx/upload-document'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { CoinNumber } from 'web/components/widgets/manaCoinNumber'
import { SPICE_COLOR } from 'web/components/portfolio/portfolio-value-graph'
import clsx from 'clsx'
import {
  SPICE_TO_CHARITY_DOLLARS,
  SPICE_TO_MANA_CONVERSION_RATE,
} from 'common/envs/constants'
import { useWebsocketUser } from 'web/hooks/use-user'
import { getIsNative } from 'web/lib/native/is-native'
import { postMessageToNative } from 'web/lib/native/post-message'
import { GPSData } from 'common/gidx/gidx'
import { useNativeMessages } from 'web/hooks/use-native-messages'

const body = {
  MerchantCustomerID: '5',
  EmailAddress: 'gochanman@yahoo.com',
  MobilePhoneNumber: '4042818372',
  DeviceIpAddress: '149.40.50.57',
  FirstName: 'Coreyy',
  LastName: 'Chandler',
  DateOfBirth: '09/28/1987',
  CitizenshipCountryCode: 'US',
  AddressLine1: '66 Forest Street',
  City: 'Reading',
  StateCode: 'MA',
  PostalCode: '01867',
  DeviceGPS: {
    Latitude: 39.615342,
    Longitude: -112.183449,
    Radius: 11.484,
    Altitude: 0,
    Speed: 0,
    DateTime: new Date().toISOString(),
  },
}

const identificationTypeToCode = {
  'Social Security': 1,
  'Driver License': 2,
  Passport: 3,
  'National Identity Card': 4,
}
const colClass = 'gap-3 p-4'
const bottomRowClass = 'mb-4 mt-4 w-full gap-16'

export const RegisterUserForm = (props: { user: User }) => {
  const user = useWebsocketUser(props.user.id) ?? props.user
  const router = useRouter()
  // TODO: After development, if user is verified, redirect to the final page
  // const [page, setPage] = useState(user.verifiedPhone ? 1 : 0)
  const [page, setPage] = useState(2)
  const [loading, setLoading] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gidxSession, setGidxSession] = useState<string | null>(null)
  useNativeMessages(['location'], (type, data) => {
    console.log('Received location data from native', data)
    if ('error' in data) {
      setLocationError(data.error)
      setLoading(false)
    } else {
      setUserInfo({
        ...userInfo,
        DeviceGPS: data,
      })
      setLoading(false)
      setPage(page + 1)
    }
  })
  const [userInfo, setUserInfo] = usePersistentInMemoryState<{
    FirstName?: string
    LastName?: string
    DateOfBirth?: string
    CitizenshipCountryCode: string
    IdentificationTypeCode?: number
    IdentificationNumber?: string
    DeviceGPS?: GPSData
  }>(
    {
      ...body,
      // FirstName: user.name.split(' ')[0],
      // LastName: user.name.split(' ')[1],
      // DateOfBirth: new Date(Date.now() - 18 * YEAR_MS)
      //   .toISOString()
      //   .split('T')[0],
      // CitizenshipCountryCode: 'US',
    },
    'gidx-registration-user-info'
  )

  const requestLocationBrowser = () => {
    setLocationError(null)
    setLoading(true)
    if (getIsNative()) {
      console.log('requesting location from native')
      postMessageToNative('locationRequested', {})
      return
    }
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { coords } = position
          setUserInfo({
            ...userInfo,
            DeviceGPS: {
              Latitude: coords.latitude,
              Longitude: coords.longitude,
              Radius: coords.accuracy,
              Altitude: coords.altitude ?? 0,
              Speed: coords.speed ?? 0,
              DateTime: new Date().toISOString(),
            },
          })
          setLoading(false)
          setPage(page + 1)
        },
        (error) => {
          setLocationError(error.message)
          setLoading(false)
        }
      )
    } else {
      setLocationError('Geolocation is not supported by your browser.')
      setLoading(false)
    }
  }

  const unfilled = Object.entries(userInfo ?? {}).filter(
    ([_, value]) => value === undefined
  )

  const getVerificationSession = async () => {
    const res = await api('get-verification-session-gidx', {
      ...userInfo,
    } as any)
    if (res) {
      const { SessionURL } = res
      const decodedString = decodeURIComponent(SessionURL).replaceAll('+', ' ')
      console.log('session url', decodedString)
      const scriptSrc = decodedString.match(/src='(.*?)'/)?.[1]
      console.log('decoded string', scriptSrc)
      setGidxSession(scriptSrc ?? '')
      setPage(page + 1)
    }
  }

  const register = async () => {
    setError(null)
    if (!userInfo.DeviceGPS) {
      setError('Location is required.')
      return
    }
    if (unfilled.length) {
      setError(`Missing fields: ${unfilled.map(([key]) => key).join(', ')}`)
      return
    }
    setLoading(true)
    const res = await api('register-gidx', {
      ...userInfo,
    } as any).catch((e) => {
      if (e instanceof APIError) setError(e.message)
      else setError(e)
      setLoading(false)
      return null
    })
    if (!res) return

    const {
      status,
      ReasonCodes: reasonCodes,
      IdentityConfidenceScore,
      FraudConfidenceScore,
    } = res
    setLoading(false)
    if (
      IdentityConfidenceScore !== undefined ||
      FraudConfidenceScore !== undefined
    ) {
      setError(
        `Confidence in identity or fraud too low. Add more information if you can.`
      )
      return
    }
    const has = (code: string) => reasonCodes.includes(code)
    const hasAny = (codes: string[]) =>
      intersection(codes, reasonCodes).length > 0
    if (hasAny(timeoutCodes)) {
      setError('Registration timed out, please try again.')
      return
    }
    if (hasAny(locationTemporarilyBlockedCodes)) {
      setError(
        'Registration failed, location blocked. Try again in an allowed location.'
      )
      return
    }
    if (has('LL-FAIL')) {
      setError(
        'Registration failed, location error. Check your location information.'
      )
      return
    }
    if (hasIdentityError(reasonCodes)) {
      setError(
        'Registration failed, identity error. Check your identifying information.'
      )
      return
    }
    if (hasAny(locationBlockedCodes)) {
      setError('Registration failed, location blocked or high risk.')
      return
    }
    if (hasAny(underageErrorCodes)) {
      setError('Registration failed, you must be 18+, (19+ in some states).')
      return
    }
    if (has('ID-EX')) {
      setError('Registration failed, ID exists already. Contact admins.')
      return
    }
    if (status === 'error') {
      setError(
        'Registration failed, ask admin about codes: ' + reasonCodes.join(', ')
      )
      return
    }
    if (status !== 'success') {
      setError('Registration failed, unknown error.')
      return
    }
    // No errors
    setPage(1000)
  }

  const idTypeName = Object.keys(identificationTypeToCode)[
    (userInfo?.IdentificationTypeCode ?? 1) - 1
  ]
  if (page === 0) {
    return (
      <Col className={colClass}>
        <span className={'text-primary-700 text-2xl'}>
          Identity Verification
        </span>
        <span>
          <span>
            To cash out prize points for cash, you must verify your identity.
          </span>
          <br />
          <br />
          You have{' '}
          <CoinNumber
            isSpice
            amount={user.spiceBalance}
            style={{
              color: SPICE_COLOR,
            }}
            className={clsx('font-bold')}
            isInline
          />
          , which is equal to{' '}
          {user.spiceBalance / SPICE_TO_MANA_CONVERSION_RATE} Mana or{' '}
          {user.spiceBalance / SPICE_TO_CHARITY_DOLLARS} dollars to charity.
        </span>
        <Row className={bottomRowClass}>
          <Button color={'gray-white'} onClick={router.back}>
            Back
          </Button>
          <Button onClick={() => setPage(page + 1)}>Start</Button>
        </Row>
      </Col>
    )
  }

  if (page === 1) {
    return (
      <RegistrationVerifyPhone
        cancel={() => null}
        next={() => setPage(page + 1)}
      />
    )
  }

  if (page === 2) {
    return (
      <LocationPanel
        requestLocation={requestLocationBrowser}
        locationError={locationError}
        loading={loading}
        back={() => (user.verifiedPhone ? setPage(0) : setPage(page - 1))}
      />
    )
  }

  if (page === 3) {
    const sectionClass = 'gap-2 w-full sm:w-96'
    return (
      <Col className={colClass}>
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
        {/* TODO: Add togle to allow user to input their address or their ID type & number*/}
        <Col className={'w-fit gap-2'}>
          <span>Identification Type</span>
          <ChoicesToggleGroup
            currentChoice={userInfo?.IdentificationTypeCode}
            choicesMap={identificationTypeToCode}
            setChoice={(val) =>
              setUserInfo({
                ...userInfo,
                IdentificationTypeCode: val as number,
              })
            }
          />
        </Col>
        <Col className={sectionClass}>
          <span>Identification Number</span>
          <Input
            placeholder={`Your ${idTypeName} number`}
            type={'text'}
            onChange={(e) =>
              setUserInfo({ ...userInfo, IdentificationNumber: e.target.value })
            }
          />
        </Col>
        {error && <span className={'text-error'}>{error}</span>}
        {user.kycStatus === 'failed' && (
          <Col
            className={'border-primary-100 w-fit gap-3 rounded border-4 p-4'}
          >
            <span>
              Having trouble? Clarify a few things verify to your identity.
            </span>
            <Button className={'w-72'} onClick={getVerificationSession}>
              Open Verification Session
            </Button>
          </Col>
        )}
        <Row className={bottomRowClass}>
          <Button
            color={'gray-white'}
            disabled={loading}
            onClick={() => setPage(page - 1)}
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

  if (page === 4 && gidxSession && typeof window !== 'undefined') {
    return (
      <Col className={colClass}>
        <div data-gidx-script-loading="true">Loading...</div>
        <Script
          strategy={'lazyOnload'}
          src={gidxSession}
          data-tsevo-script-tag
          data-gidx-session-id={gidxSession.split('sessionid=')[1]}
          type="text/javascript"
        />
        <Row className={bottomRowClass}>
          <Button color={'gray-white'} onClick={() => setPage(page - 1)}>
            Back
          </Button>
          <Button onClick={() => setPage(page + 1)}>Next</Button>
        </Row>
      </Col>
    )
  }

  if (page === 5) {
    return (
      <UploadDocuments
        back={() => setPage(page - 1)}
        next={() => setPage(page + 1)}
      />
    )
  }

  return (
    <Col className={colClass}>
      <span className={'text-primary-700 text-2xl'}>
        Identity Verification Complete
      </span>
      Thank you for verifying your identity! Now you can cash out prize points
      for cash.
      <Row className={bottomRowClass}>
        <Link className={buttonClass('md', 'indigo')} href={'/home'}>
          Done
        </Link>
      </Row>
    </Col>
  )
}

const LocationPanel = (props: {
  requestLocation: () => void
  locationError: string | null
  back: () => void
  loading: boolean
}) => {
  const { back, requestLocation, locationError, loading } = props
  return (
    <Col className={colClass}>
      <span className={' text-primary-700 text-2xl'}>Location required</span>
      <span>
        You must allow location sharing to verify that you're in a participating
        municipality.
      </span>
      <Row className={bottomRowClass}>
        <Button color={'gray-white'} onClick={back}>
          Back
        </Button>
        <Button loading={loading} disabled={loading} onClick={requestLocation}>
          Share location
        </Button>
      </Row>
      {locationError && (
        <span className={'text-error'}>
          {locationError}
          {getIsNative()
            ? ' Please enable location sharing in your settings.'
            : ''}
        </span>
      )}
    </Col>
  )
}
