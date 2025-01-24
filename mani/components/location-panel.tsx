import { useEffect } from 'react'
import { View, StyleSheet, ActivityIndicator } from 'react-native'
import { Text } from 'components/text'
import { Button } from 'components/buttons/button'
import { Colors } from 'constants/colors'
import { GPSData } from 'common/gidx/gidx'
import * as Location from 'expo-location'

export const LocationPanel = (props: {
  location: GPSData | undefined
  setLocation: (data: GPSData) => void
  setLocationError: (error: string | undefined) => void
  setLoading: (loading: boolean) => void
  loading: boolean
  locationError: string | undefined
  back: () => void
}) => {
  const {
    location,
    setLocation,
    setLocationError,
    setLoading,
    loading,
    locationError,
    back,
  } = props

  const requestLocation = async () => {
    setLoading(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setLocationError('Permission to access location was denied')
        return
      }

      const location = await Location.getCurrentPositionAsync({})
      const gpsData: GPSData = {
        Latitude: location.coords.latitude,
        Longitude: location.coords.longitude,
        Radius: location.coords.accuracy || 0,
        Altitude: location.coords.altitude || 0,
        Speed: location.coords.speed || 0,
        DateTime: new Date().toISOString(),
      }
      setLocation(gpsData)
    } catch (error: any) {
      setLocationError(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const checkLocationPermission = async () => {
      const { status } = await Location.getForegroundPermissionsAsync()
      if (status === 'granted') {
        requestLocation()
        return
      }
      setLoading(false)
    }
    checkLocationPermission()
  }, [])

  if (loading || location) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.blue} />
        <Text style={styles.loadingText}>Getting your location...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Location required</Text>
      <Text style={styles.subtitle}>
        You must allow location sharing to verify that you're in a participating
        municipality.
      </Text>
      <View style={styles.buttonRow}>
        <Button onPress={back} title="Back" variant="gray" />
        <Button
          loading={loading}
          disabled={loading}
          onPress={requestLocation}
          title="Share location"
        />
      </View>
      {locationError && <Text style={styles.errorText}>{locationError}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    color: Colors.textSecondary,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 16,
  },
  errorText: {
    color: Colors.error,
    marginTop: 16,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textSecondary,
  },
})
