import {
  ENABLE_FAKE_CUSTOMER,
  FAKE_CUSTOMER_BODY,
  GPSData,
} from 'common/gidx/gidx'
import { useEffect, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { getIsNative } from 'web/lib/native/is-native'
import { postMessageToNative } from 'web/lib/native/post-message'
import { BottomRow } from './register-component-helpers'
import { LocationBlockedIcon } from 'web/public/custom-components/locationBlockedIcon'

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
          if (error.PERMISSION_DENIED) {
            setLocationError(
              'Location permission denied. Please enable location sharing in your browser settings.'
            )
          } else {
            setLocationError(error.message)
          }
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
    return <LoadingIndicator />
  }

  return (
    <>
      <LocationBlockedIcon height={40} className="fill-ink-700 mx-auto" />
      <span className={'mx-auto text-2xl'}>Location required</span>
      <span className="text-ink-700">
        You must allow location sharing to verify that you're in a participating
        municipality.
      </span>
      <BottomRow>
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
      </BottomRow>
      {locationError && (
        <span className={'text-error'}>
          {locationError}
          {getIsNative()
            ? ' Please enable location sharing in your settings.'
            : ''}
        </span>
      )}
    </>
  )
}
