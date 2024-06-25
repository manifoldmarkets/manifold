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
import { exampleCustomers, GPSData } from 'common/gidx/gidx'
import { useNativeMessages } from 'web/hooks/use-native-messages'

const body = {
  ...exampleCustomers[2],
  MerchantCustomerID: '11',
}
//   {
//   EmailAddress: 'gochanman@yahoo.com',
//   MobilePhoneNumber: '4042818372',
//   DeviceIpAddress: '149.40.50.57',
//   FirstName: 'Coreyy',
//   LastName: 'Chandler',
//   DateOfBirth: '09/28/1987',
//   CitizenshipCountryCode: 'US',
//   IdentificationTypeCode: 2,
//   IdentificationNumber: '123456789',
//   AddressLine1: '66 Forest Street',
//   City: 'Reading',
//   StateCode: 'MA',
//   PostalCode: '01867',
//   DeviceGPS: {
//     Latitude: 39.615342,
//     Longitude: -112.183449,
//     Radius: 11.484,
//     Altitude: 0,
//     Speed: 0,
//     DateTime: new Date().toISOString(),
//   },
// }

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
  const [page, setPage] = useState(
    user.kycStatus === 'verified'
      ? 1000
      : user.kycStatus === 'await-documents'
      ? 4
      : user.verifiedPhone
      ? 1
      : 0
  )
  const [loading, setLoading] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
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
      //IdentificationTypeCode: 2,
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
            // DeviceGPS: {
            //   Latitude: coords.latitude,
            //   Longitude: coords.longitude,
            //   Radius: coords.accuracy,
            //   Altitude: coords.altitude ?? 0,
            //   Speed: coords.speed ?? 0,
            //   DateTime: new Date().toISOString(),
            // },
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
      MerchantCustomerID: user.id,
      ...userInfo,
    } as any).catch((e) => {
      if (e instanceof APIError) setError(e.message)
      else setError(e)
      setLoading(false)
      return null
    })
    if (!res) return

    const { status, message } = res
    setLoading(false)

    if (message && status === 'error') {
      setError(message)
      return
    }
    // No errors
    setPage(page + 1)
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
          {user.spiceBalance * SPICE_TO_MANA_CONVERSION_RATE} Mana or{' '}
          {user.spiceBalance * SPICE_TO_CHARITY_DOLLARS} dollars to charity.
        </span>
        <Row className={bottomRowClass}>
          <Button color={'gray-white'} onClick={router.back}>
            Back
          </Button>
          <Button
            color={'gold'}
            disabled={user.spiceBalance === 0}
            onClick={() => setPage(page + 1)}
          >
            Start verification
          </Button>
        </Row>
      </Col>
    )
  }

  if (page === 1) {
    return (
      <RegistrationVerifyPhone
        cancel={() => setPage(page - 1)}
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
            value={userInfo.IdentificationNumber}
            onChange={(e) =>
              setUserInfo({ ...userInfo, IdentificationNumber: e.target.value })
            }
          />
        </Col>
        {error && <span className={'text-error'}>{error}</span>}
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

  if (page === 4) {
    return (
      <UploadDocuments
        back={() =>
          user.kycStatus === 'await-documents'
            ? router.back()
            : setPage(page - 1)
        }
        next={() => setPage(page + 1)}
      />
    )
  }
  if (user.kycStatus === 'pending') {
    return (
      <Col className={colClass}>
        <span className={'text-primary-700 text-2xl'}>
          Verification pending
        </span>
        Thank you for submitting your identification information! Your identity
        verification is pending. Check back later to see if you're verified.
        <Row className={bottomRowClass}>
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
