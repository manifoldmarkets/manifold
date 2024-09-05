import {
  ENABLE_FAKE_CUSTOMER,
  FAKE_CUSTOMER_BODY,
  GPSData,
} from 'common/gidx/gidx'
import { useEffect, useState } from 'react'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { getIsNative } from 'web/lib/native/is-native'
import { postMessageToNative } from 'web/lib/native/post-message'
import { Col } from 'web/components/layout/col'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import {
  registrationBottomRowClass,
  registrationColClass,
} from 'web/components/gidx/register-user-form'

export const LocationPanel = (props: {
  setLocation: (data: GPSData) => void
  setLocationError: (error: string | undefined) => void
  setLoading: (loading: boolean) => void
  loading: boolean
  locationError: string | undefined
  back: () => void
}) => {
  const {
    setLocation,
    setLocationError,
    setLoading,
    loading,
    locationError,
    back,
  } = props

  const [checkedPermissions, setCheckedPermissions] = useState(false)

  useEffect(() => {
    if (!checkedPermissions) checkLocationPermission()
  }, [])

  // TODO: native app optimization: see if they've already given location permission
  const checkLocationPermission = async () => {
    setLoading(true)

    if ('permissions' in navigator) {
      try {
        const permissionStatus = await navigator.permissions.query({
          name: 'geolocation',
        })
        switch (permissionStatus.state) {
          case 'granted':
            console.log('Location permission already granted')
            requestLocation(() => setCheckedPermissions(true))
            break
          case 'prompt':
            console.log('Location permission has not been requested yet')
            setCheckedPermissions(true)
            setLoading(false)
            break
          case 'denied':
            console.log('Location permission has been denied')
            setCheckedPermissions(true)
            setLoading(false)
            break
        }
      } catch (error) {
        console.error('Error checking geolocation permission:', error)
        setCheckedPermissions(true)
      }
    } else {
      console.log('Permissions API not supported')
      setCheckedPermissions(true)
    }
  }

  useNativeMessages(['location'], (type, data) => {
    console.log('Received location data from native', data)
    if ('error' in data) {
      setLocationError(data.error)
    } else {
      setLocation({
        ...data,
      })
    }
    setLoading(false)
  })

  const requestLocation = (onFinishCallback?: () => void) => {
    setLocationError(undefined)
    setLoading(true)
    if (getIsNative()) {
      console.log('requesting location from native')
      postMessageToNative('locationRequested', {})
      onFinishCallback?.()
      return
    }
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { coords } = position
          setLocation(
            ENABLE_FAKE_CUSTOMER
              ? FAKE_CUSTOMER_BODY.DeviceGPS
              : {
                  Latitude: coords.latitude,
                  Longitude: coords.longitude,
                  Radius: coords.accuracy,
                  Altitude: coords.altitude ?? 0,
                  Speed: coords.speed ?? 0,
                  DateTime: new Date().toISOString(),
                }
          )
          setLoading(false)
          onFinishCallback?.()
        },
        (error) => {
          setLocationError(error.message)
          setLoading(false)
          onFinishCallback?.()
        }
      )
    } else {
      setLocationError('Geolocation is not supported by your browser.')
      setLoading(false)
      onFinishCallback?.()
    }
  }

  if (!checkedPermissions) {
    return (
      <Col className={registrationColClass}>
        <LoadingIndicator />
      </Col>
    )
  }

  return (
    <Col className={registrationColClass}>
      <span className={' text-primary-700 text-2xl'}>Location required</span>
      <span>
        You must allow location sharing to verify that you're in a participating
        municipality.
      </span>
      <Row className={registrationBottomRowClass}>
        <Button color={'gray-white'} onClick={back}>
          Back
        </Button>
        <Button
          loading={loading}
          disabled={loading}
          onClick={() => requestLocation()}
        >
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
