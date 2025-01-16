import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { log } from 'components/logger'
import { isFunction } from 'client-common/hooks/use-persistent-in-memory-state'
import { useEvent } from 'client-common/hooks/use-event'

export const usePersistentLocalState = <T>(initialValue: T, key: string) => {
  const [state, setState] = useState<T>(initialValue)
  const [ready, setReady] = useState(false)

  const saveState = useEvent((newState: T | ((prevState: T) => T)) => {
    setState((prevState: T) => {
      const updatedState = isFunction(newState) ? newState(prevState) : newState
      setPersistentLocalState(key, updatedState)
      return updatedState
    })
  })

  useEffect(() => {
    // Set initial state from AsyncStorage
    getPersistentLocalState(key).then((storedValue) => {
      const value = storedValue === null ? initialValue : storedValue
      setState(value as T)
      setReady(true)
    })
  }, [key, initialValue])

  return [state, saveState, ready] as const
}

export const getPersistentLocalState = async (key: string) => {
  try {
    const jsonValue = await AsyncStorage.getItem(key)
    return jsonValue != null ? JSON.parse(jsonValue) : null
  } catch (e) {
    log('error reading value from AsyncStorage', e)
    return null
  }
}

export const setPersistentLocalState = async <T>(key: string, value: T) => {
  try {
    const jsonValue = JSON.stringify(value)
    await AsyncStorage.setItem(key, jsonValue)
  } catch (e) {
    log('error saving value to AsyncStorage', e)
  }
}
