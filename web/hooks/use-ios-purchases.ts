import { useState } from 'react'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { MesageTypeMap, nativeToWebMessageType } from 'common/native-message'
import { WebPriceInDollars } from 'common/economy'
import { postMessageToNative } from 'web/lib/native/post-message'
import { api } from 'web/lib/api/api'

export function useIosPurchases(
  setError: (error: string | null) => void,
  setLoadingPrice: (loading: WebPriceInDollars | null) => void,
  onSuccess: () => void
) {
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null)

  const handleIapReceipt = async <T extends nativeToWebMessageType>(
    type: T,
    data: MesageTypeMap[T]
  ) => {
    if (type === 'iapReceipt' && !loadingMessage) {
      setLoadingMessage('Validating receipt, hold on...')
      const { receipt } = data as MesageTypeMap['iapReceipt']
      try {
        await api('validateIap', { receipt })
        console.log('iap receipt validated')
        setError(null)
        setLoadingMessage(null)
        setLoadingPrice(null)
        onSuccess()
      } catch (e) {
        console.error('iap receipt validation error', e)
        setError('Error validating receipt')
        setLoadingMessage(null)
        setLoadingPrice(null)
      }
    } else if (type === 'iapError') {
      setError('Error during purchase! Try again.')
      setLoadingMessage(null)
      setLoadingPrice(null)
    }
  }

  useNativeMessages(['iapReceipt', 'iapError'], handleIapReceipt)

  const initiatePurchaseInDollars = (amountInDollars: number) => {
    setError(null)
    setLoadingPrice(amountInDollars as WebPriceInDollars)
    setLoadingMessage(null)
    console.log('initiating purchase', amountInDollars)
    // Expects cents
    postMessageToNative('checkout', { amount: amountInDollars * 100 })
  }

  return {
    loadingMessage,
    setError,
    initiatePurchaseInDollars,
  }
}
