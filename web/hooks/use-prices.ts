import { IOS_PRICES, MANA_WEB_PRICES, PaymentAmount } from 'common/economy'
import { useNativeInfo } from 'web/components/native-message-provider'

export const usePrices = () => {
  const { isNative, platform } = useNativeInfo()
  const isIOS = platform === 'ios' && isNative
  const prices = isIOS ? IOS_PRICES : MANA_WEB_PRICES
  return prices as PaymentAmount[]
}
