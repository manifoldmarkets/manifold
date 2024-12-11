import { useEffect, useState } from 'react'
import NetInfo, { NetInfoState } from '@react-native-community/netinfo'

export const useIsConnected = () => {
  const [isConnected, setIsConnected] = useState(true)
  const handleConnectivityChange = (state: NetInfoState) => {
    setIsConnected(state.isConnected ?? false)
  }

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(handleConnectivityChange)
    // Cleanup function
    return () => {
      unsubscribe()
    }
  }, [])
  return isConnected
}
