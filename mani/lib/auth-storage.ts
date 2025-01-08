import AsyncStorage from '@react-native-async-storage/async-storage'
import { log } from 'components/logger'

export type keys = 'user' | 'admin-token'
export const storeData = async <T>(key: keys, value: T) => {
  try {
    const jsonValue = JSON.stringify(value)
    await AsyncStorage.setItem(key, jsonValue)
  } catch (e) {
    log('error saving value', e)
  }
}

export const clearData = async (key: keys) => {
  await AsyncStorage.setItem(key, '')
}
export const getData = async <T>(key: keys) => {
  try {
    const jsonValue = await AsyncStorage.getItem(key)
    return jsonValue != null ? (JSON.parse(jsonValue) as T) : null
  } catch (e) {
    log('error reading value', e)
  }
}
