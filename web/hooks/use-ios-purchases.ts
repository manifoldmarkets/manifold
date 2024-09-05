import { useState } from 'react'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { MesageTypeMap, nativeToWebMessageType } from 'common/native-message'
import { validateIapReceipt } from 'web/lib/api/api'
import { WebManaAmounts } from 'common/economy'
import { postMessageToNative } from 'web/lib/native/post-message'

export function useIosPurchases(
  setError: (error: string | null) => void,
  setLoading: (loading: WebManaAmounts | null) => void,
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
        await validateIapReceipt({ receipt: receipt })
        console.log('iap receipt validated')
        setError(null)
        setLoadingMessage(null)
        setLoading(null)
        onSuccess()
      } catch (e) {
        console.error('iap receipt validation error', e)
        setError('Error validating receipt')
        setLoadingMessage(null)
        setLoading(null)
      }
    } else if (type === 'iapError') {
      setError('Error during purchase! Try again.')
      setLoadingMessage(null)
      setLoading(null)
    }
  }

  useNativeMessages(['iapReceipt', 'iapError'], handleIapReceipt)

  const initiatePurchaseInDollars = (amountInDollars: number) => {
    setError(null)
    setLoading(amountInDollars as WebManaAmounts)
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
