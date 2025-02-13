import { PaymentAmount } from 'common/economy'
import { api } from 'lib/api'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import {
  isIosStorekit2,
  PurchaseError,
  requestPurchase,
  Sku,
  useIAP,
} from 'react-native-iap'

const SKUS = ['S10', 'S25', 'S100']

export const IosIapListener = (props: {
  checkoutAmount: PaymentAmount | null
  setCheckoutAmount: (amount: PaymentAmount | null) => void
  setLoading: (price: PaymentAmount | null) => void
  setError: (error: string) => void
}) => {
  const { checkoutAmount, setCheckoutAmount, setLoading, setError } = props
  const [didGetPurchaseError, setDidGetPurchaseError] = useState<string | null>(
    null
  )
  const {
    connected,
    products,
    currentPurchase,
    currentPurchaseError,
    initConnectionError,
    finishTransaction,
    getAvailablePurchases,
    availablePurchases,
    getProducts,
  } = useIAP()

  useEffect(() => {
    if (currentPurchaseError || initConnectionError) {
      console.error('error with products:', products)
      if (currentPurchaseError) {
        console.error('current purchase error', currentPurchaseError)
        setDidGetPurchaseError('currentPurchaseError')
      } else if (initConnectionError) {
        console.error('init connection error', initConnectionError)
        setDidGetPurchaseError('initConnectionError')
      }
      setError('Error during purchase! Try again.')
      getAvailablePurchases()
    }
  }, [currentPurchaseError, initConnectionError])

  useEffect(() => {
    if (availablePurchases.length > 0) {
      console.log('availablePurchases', availablePurchases)
    }
  }, [availablePurchases])

  useEffect(() => {
    const checkCurrentPurchase = async () => {
      try {
        if (
          (isIosStorekit2() && currentPurchase?.transactionId) ||
          currentPurchase?.transactionReceipt
        ) {
          await finishTransaction({
            purchase: currentPurchase,
            isConsumable: true,
          })
          const receipt = currentPurchase.transactionReceipt
          console.log('finishTransaction receipt', receipt)
          if (didGetPurchaseError) {
            console.error(
              'didGetPurchaseError',
              'current purchase:',
              currentPurchase,
              'error:',
              currentPurchaseError,
              'initConnectionError:',
              initConnectionError
            )
          }
          await api('validateIap', {
            receipt,
          })
          setLoading(null)
        }
      } catch (error) {
        if (error instanceof PurchaseError) {
          console.log({ message: `[${error.code}]: ${error.message}`, error })
        } else {
          console.log({ message: 'handleBuyProduct', error })
        }
        setError('Error during purchase! Contact admin.')
      }
    }

    checkCurrentPurchase()
  }, [currentPurchase, finishTransaction])

  const handleBuyProduct = async (sku: Sku) => {
    setDidGetPurchaseError(null)
    try {
      await requestPurchase({ sku })
    } catch (error) {
      if (error instanceof PurchaseError) {
        console.log({ message: `[${error.code}]: ${error.message}`, error })
      } else {
        console.log({ message: 'handleBuyProduct', error })
      }
    }
  }

  useEffect(() => {
    console.log(
      'products available:',
      products.map((p) => p.productId)
    )
  }, [products])

  useEffect(() => {
    console.log('iap connected', connected)
    if (connected && !products.length) {
      getProducts({
        skus: SKUS,
      }).catch((e) => {
        console.log('getProducts error', e)
      })
    }
  }, [connected])

  useEffect(() => {
    if (!checkoutAmount) return
    const sku = checkoutAmount.sku
    if (sku) handleBuyProduct(sku)
    else setError('Error during purchase! Could not find product.')
    setCheckoutAmount(null)
  }, [checkoutAmount])

  return <View />
}
