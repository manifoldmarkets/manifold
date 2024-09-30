import { IOS_PRICES, PaymentAmount, getPricesForUser } from 'common/economy'
import { useNativeInfo } from 'web/components/native-message-provider'
import { useUser } from './use-user'

export const usePrices = () => {
  const user = useUser()
  const { isNative, platform } = useNativeInfo()
  const isIOS = platform === 'ios' && isNative
  const prices = isIOS ? IOS_PRICES : getPricesForUser(user)
  return prices as PaymentAmount[]
}
