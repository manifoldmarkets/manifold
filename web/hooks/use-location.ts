import { useState } from 'react'
import {
  ENABLE_FAKE_CUSTOMER,
  FAKE_CUSTOMER_BODY,
  GPSData,
} from 'common/gidx/gidx'
import { getIsNative } from 'web/lib/native/is-native'
import { postMessageToNative } from 'web/lib/native/post-message'
import { MINUTE_MS } from 'common/util/time'

export const useLocation = (
  setLocation: (data: GPSData) => void,
  setLocationError: (error: string | undefined) => void,
  setLoading: (loading: boolean) => void
) => {
  const [checkedPermissions, setCheckedPermissions] = useState(false)
  const [timeout, setTimeoutState] = useState(10000)

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
      console.error('Permissions API not supported')
      setCheckedPermissions(true)
    }
  }

  const requestLocation = (onFinishCallback?: (location?: GPSData) => void) => {
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
          const location = {
            Latitude: coords.latitude,
            Longitude: coords.longitude,
            Radius: coords.accuracy,
            Altitude: coords.altitude ?? 0,
            Speed: coords.speed ?? 0,
            DateTime: new Date().toISOString(),
          }
          setLocation(
            ENABLE_FAKE_CUSTOMER ? FAKE_CUSTOMER_BODY.DeviceGPS : location
          )
          setLoading(false)
          onFinishCallback?.(location)
        },
        (error) => {
          console.error('Error requesting location', error)
          if (error.message.includes('denied')) {
            setLocationError(
              'Location permission denied. Please enable location sharing in your browser settings.'
            )
          } else {
            if (error.message.includes('timeout')) {
              setTimeoutState(timeout + 5000)
            }
            setLocationError(error.message)
          }
          setLoading(false)
          onFinishCallback?.()
        },
        {
          enableHighAccuracy: true,
          timeout,
          maximumAge: 20 * MINUTE_MS,
        }
      )
    } else {
      setLocationError('Geolocation is not supported by your browser.')
      setLoading(false)
      onFinishCallback?.()
    }
  }

  return { checkedPermissions, requestLocation, checkLocationPermission }
}
