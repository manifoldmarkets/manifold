import * as Location from 'expo-location'
import { GPSData } from 'common/gidx/gidx'

export const getLocation = async () => {
  let { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') {
    console.log('Permission to access location was denied')
    return { error: 'Permission to access location was denied' }
  }

  let location = await Location.getCurrentPositionAsync({})

  return {
    Latitude: location.coords.latitude,
    Longitude: location.coords.longitude,
    Altitude: location.coords.altitude,
    Radius: location.coords.accuracy,
    DateTime: new Date(location.timestamp).toISOString(),
    Speed: location.coords.speed,
  } as GPSData
}
