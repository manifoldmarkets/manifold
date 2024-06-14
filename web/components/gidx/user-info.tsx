import { Col } from 'web/components/layout/col'
import { Input } from 'web/components/widgets/input'
import { Button } from 'web/components/buttons/button'
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
  RegistrationReturnType,
  timeoutCodes,
  underageErrorCodes,
} from 'common/reason-codes'
import { intersection } from 'lodash'

const body = {
  MerchantCustomerID: '2',
  EmailAddress: 'gochanman@yahoo.com',
  MobilePhoneNumber: '4042818372',
  DeviceIpAddress: '149.40.50.57',
  FirstName: 'Corey',
  LastName: 'Chandler',
  DateOfBirth: '09/28/1987',
  CitizenshipCountryCode: 'US',
  AddressLine1: '66 Forest Street',
  City: 'Reading',
  StateCode: 'MA',
  PostalCode: '01867',
}
const DeviceGPS = {
  Latitude: 42.329061,
  Longitude: -71.152265,
  Radius: 11.484,
  Altitude: 0,
  Speed: 0,
  DateTime: new Date().toISOString(),
}

const identificationTypeToCode = {
  'Social Security': 1,
  'Driver License': 2,
  Passport: 3,
  'National Identity Card': 4,
}

export const UserInfo = (props: {
  user: User
  setOpen: (open: boolean) => void
}) => {
  const { user, setOpen } = props
  // const [page, setPage] = useState(user.verifiedPhone ? 1 : 0)
  const [page, setPage] = useState(2)
  const [loading, setLoading] = useState(false)
  const [location, setLocation] = usePersistentInMemoryState<{
    Radius: number
    Altitude: number
    Latitude: number
    Longitude: number
    Speed: number
  } | null>(DeviceGPS, 'gidx-registration-location')
  const [locationError, setLocationError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [userInfo, setUserInfo] = usePersistentInMemoryState<{
    FirstName?: string
    LastName?: string
    DateOfBirth?: string
    CitizenshipCountryCode: string
    IdentificationTypeCode?: number
    IdentificationNumber?: string
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

  const rowClass = 'gap-2 w-full sm:w-96'

  const requestLocationBrowser = () => {
    setLoading(true)
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { coords } = position
          setLocation({
            Latitude: coords.latitude,
            Longitude: coords.longitude,
            Radius: coords.accuracy,
            Altitude: coords.altitude ?? 0,
            Speed: coords.speed ?? 0,
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
  const unfilled = Object.entries(userInfo ?? {}).filter(([_, value]) => !value)
  const submit = async () => {
    if (!location) {
      setError('Location is required')
      return
    }

    if (unfilled.length) {
      setError(`Missing fields: ${unfilled.map(([key]) => key).join(', ')}`)
      return
    }
    setLoading(true)
    const res = await api('register-gidx', {
      ...location,
      DateTime: new Date().toISOString(),
      ...userInfo,
    } as any).catch((e) => {
      if (e instanceof APIError) setError(e.message)
      else setError(e)
      return { status: 'error', ReasonCodes: [] } as RegistrationReturnType
    })
    const { status, ReasonCodes: reasonCodes } = res
    setLoading(false)
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
    }
  }

  const idTypeName = Object.keys(identificationTypeToCode)[
    (userInfo?.IdentificationTypeCode ?? 1) - 1
  ]

  if (page === 0) {
    return (
      <RegistrationVerifyPhone
        cancel={() => setOpen(false)}
        next={() => setPage(page + 1)}
      />
    )
  }
  if (page === 1) {
    return (
      <Col className={'gap-3'}>
        <span className={' text-primary-700 text-2xl'}>Location required</span>
        <span>
          You <strong>must</strong> allow location sharing to verify that you're
          in a participating municipality.
        </span>
        <Row className={'mb-4 mt-4 w-full gap-12'}>
          <Button color={'gray-white'} onClick={() => null}>
            Cancel
          </Button>
          <Button
            loading={loading}
            disabled={loading}
            onClick={requestLocationBrowser}
          >
            Share location
          </Button>
          {locationError && <span>{locationError}</span>}
        </Row>
      </Col>
    )
  }

  return (
    <Col className={'gap-3'}>
      <span className={'text-primary-700 text-2xl'}>Identity Verification</span>
      <Col className={rowClass}>
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
      <Col className={rowClass}>
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
      <Col className={rowClass}>
        <span>Date of Birth</span>
        <Input
          className={'w-40'}
          type={'date'}
          value={userInfo.DateOfBirth}
          onChange={(e) =>
            setUserInfo({ ...userInfo, DateOfBirth: e.target.value })
          }
        />
      </Col>
      <Col className={rowClass}>
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
            setUserInfo({ ...userInfo, IdentificationTypeCode: val as number })
          }
        />
      </Col>
      <Col className={rowClass}>
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
      <Row className={'mb-4 mt-4 w-full gap-16'}>
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
          onClick={submit}
        >
          Submit
        </Button>
      </Row>
    </Col>
  )
}
