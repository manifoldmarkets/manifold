import {
  ENABLE_FAKE_CUSTOMER,
  FAKE_CUSTOMER_BODY,
  GPSData,
} from 'common/gidx/gidx'
import { postMessageToNative } from 'web/lib/native/post-message'
import { MINUTE_MS } from 'common/util/time'
import { useNativeMessages } from './use-native-messages'
import { useEvent } from './use-event'
import { useNativeInfo } from 'web/components/native-message-listener'

export const useLocation = (
  setLocationError: (error: string | undefined) => void,
  setLoading: (loading: boolean) => void,
  onFinishPermissionCheck: (location?: GPSData) => void,
  onFinishLocationCheck?: (location?: GPSData) => void
) => {
  const { version, isNative } = useNativeInfo()
  const checkLocationPermission = useEvent(async () => {
    setLoading(true)
    // We added locationPermissionStatusRequested handling at the same time as native version capability
    if (isNative && version) {
      postMessageToNative('locationPermissionStatusRequested', {})
      return
    }
    if ('permissions' in navigator) {
      try {
        const permissionStatus = await navigator.permissions.query({
          name: 'geolocation',
        })
        switch (permissionStatus.state) {
          case 'granted':
            console.log('Location permission already granted')
            requestLocation(onFinishPermissionCheck)
            break
          case 'prompt':
            console.log('Location permission has not been requested yet')
            setLoading(false)
            onFinishPermissionCheck()
            break
          case 'denied':
            console.log('Location permission has been denied')
            setLoading(false)
            onFinishPermissionCheck()
            break
        }
      } catch (error) {
        console.error('Error checking geolocation permission:', error)
        setLoading(false)
        onFinishPermissionCheck()
      }
    } else {
      console.error('Permissions API not supported')
      setLoading(false)
      onFinishPermissionCheck()
    }
  })

  useNativeMessages(['locationPermissionStatus'], (type, data) => {
    const { status } = data
    console.log('Native location permission status', status)
    if (status === 'granted') {
      requestLocation(onFinishPermissionCheck)
    } else {
      onFinishPermissionCheck()
      setLoading(false)
    }
  })

  useNativeMessages(['location'], (type, data) => {
    console.log('Native location', data)
    if ('error' in data) {
      setLoading(false)
      setLocationError(data.error)
      onFinishLocationCheck?.()
    } else {
      setLoading(false)
      onFinishLocationCheck?.(data as GPSData)
    }
  })

  const requestLocation = useEvent(
    (overrideOnFinishCallback?: (location?: GPSData) => void) => {
      const onFinish = overrideOnFinishCallback ?? onFinishLocationCheck
      setLocationError(undefined)
      setLoading(true)
      if (isNative) {
        console.log('requesting location from native')
        postMessageToNative('locationRequested', {})
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
            setLoading(false)
            onFinish?.(
              ENABLE_FAKE_CUSTOMER ? FAKE_CUSTOMER_BODY.DeviceGPS : location
            )
          },
          (error) => {
            console.error('Error requesting location', error)
            if (error.message.includes('denied')) {
              setLocationError(
                'Location permission denied. Please enable location sharing in your browser settings.'
              )
            } else {
              setLocationError(error.message)
            }
            setLoading(false)
            onFinish?.()
          },
          {
            enableHighAccuracy: true,
            maximumAge: 20 * MINUTE_MS,
          }
        )
      } else {
        setLocationError('Geolocation is not supported by your browser.')
        setLoading(false)
        onFinish?.()
      }
    }
  )

  return { requestLocation, checkLocationPermission }
}
