import { MANI_IOS_PRICES } from 'common/economy'
import { Platform } from 'react-native'

export function usePrices() {
  return Platform.OS === 'ios' ? MANI_IOS_PRICES : []
}
