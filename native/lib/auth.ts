import AsyncStorage from '@react-native-async-storage/async-storage'

export type keys = 'user'
export const storeData = async (key: keys, value: object) => {
  try {
    const jsonValue = JSON.stringify(value)
    await AsyncStorage.setItem(key, jsonValue)
  } catch (e) {
    // saving error
  }
}
export const clearData = async (key: keys) => {
  try {
    await AsyncStorage.setItem(key, '')
  } catch (e) {
    // saving error
  }
}
export const getData = async <T>(key: keys) => {
  try {
    const jsonValue = await AsyncStorage.getItem(key)
    return jsonValue != null ? (JSON.parse(jsonValue) as T) : null
  } catch (e) {
    // error reading value
    console.log('error reading value', e)
  }
}
