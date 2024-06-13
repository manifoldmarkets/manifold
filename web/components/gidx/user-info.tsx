import { Col } from 'web/components/layout/col'
import { Input } from 'web/components/widgets/input'
import { Button } from 'web/components/buttons/button'
import { User } from 'common/user'
import { CountryCodeSelector } from 'web/components/country-code-selector'
import { Row } from 'web/components/layout/row'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useState } from 'react'
import { APIError, call } from 'web/lib/firebase/api'
import { getApiUrl } from 'common/api/utils'

export const UserInfo = (props: { user: User }) => {
  const { user } = props
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [location, setLocation] = useState<{
    Radius: number
    Altitude: number
    Latitude: number
    Longitude: number
    Speed: number
  } | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [userInfo, setUserInfo] = usePersistentInMemoryState<{
    FirstName?: string
    LastName?: string
    DateOfBirth?: string
    CitizenshipCountryCode?: string
    IdentificationTypeCode?: number
    IdentificationNumber?: string
  }>(
    {
      FirstName: user.name.split(' ')[0],
      LastName: user.name.split(' ')[1],
    },
    'gidx-registration-user-info'
  )
  const rowClass = 'gap-2'

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

  const submit = async () => {
    if (!location) {
      setError('Location is required')
      return
    }
    const unfilled = Object.entries(userInfo ?? {}).filter(
      ([_, value]) => !value
    )
    if (unfilled.length) {
      setError(`Missing fields: ${unfilled.map(([key]) => key).join(', ')}`)
      return
    }
    setLoading(true)
    await call(getApiUrl('register-gidx'), 'POST', {
      ...location,
      DateTime: new Date().toISOString(),
      ...userInfo,
    })
      .catch((e) => (e instanceof APIError ? setError(e.message) : setError(e)))
      .finally(() => setLoading(false))
  }

  if (page === 0) {
    return (
      <Col className={'gap-3'}>
        <span className={' text-primary-700 text-2xl'}>Location required</span>
        <span>
          You must allow location services to verify you're located in a
          participating municipality.
        </span>
        <Row className={'mt-2 w-full justify-between'}>
          <Button color={'gray-white'} onClick={() => null}>
            Cancel
          </Button>
          <Button
            loading={loading}
            disabled={loading}
            onClick={requestLocationBrowser}
          >
            Continue to allow location
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
          type={'text'}
          onChange={(e) =>
            setUserInfo({ ...userInfo, FirstName: e.target.value })
          }
        />
      </Col>
      <Col className={rowClass}>
        <span>Last Name</span>
        <Input
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
          onChange={(e) =>
            setUserInfo({ ...userInfo, DateOfBirth: e.target.value })
          }
        />
      </Col>
      <Col className={rowClass}>
        <span>Citizenship Country Code</span>
        <CountryCodeSelector
          selectedCountry={userInfo?.CitizenshipCountryCode ?? ''}
          setSelectedCountry={(val) =>
            setUserInfo({ ...userInfo, CitizenshipCountryCode: val })
          }
        />
      </Col>
      <Col className={rowClass}>
        {/* create map of social, DL, passport, or national identity card to code number*/}
        <span>Identification Type</span>
        <ChoicesToggleGroup
          currentChoice={userInfo?.IdentificationTypeCode}
          choicesMap={{
            'Social Security Number': 1,
            'Driver License': 2,
            Passport: 3,
            'National Identity Card': 4,
          }}
          setChoice={(val) =>
            setUserInfo({ ...userInfo, IdentificationTypeCode: val as number })
          }
        />
      </Col>
      <Col className={rowClass}>
        <span>Identification Number</span>
        <Input
          type={'text'}
          onChange={(e) =>
            setUserInfo({ ...userInfo, IdentificationNumber: e.target.value })
          }
        />
      </Col>
      <Row className={'justify-between'}>
        <Button color={'gray-white'} onClick={() => setPage(page - 1)}>
          Back
        </Button>
        <Button loading={loading} disabled={loading} onClick={submit}>
          Continue
        </Button>
      </Row>
      {error && <span>{error}</span>}
    </Col>
  )
}
