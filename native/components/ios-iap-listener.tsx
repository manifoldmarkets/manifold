import { useEffect, useState } from 'react'
import { View } from 'react-native'
import {
  isIosStorekit2,
  PurchaseError,
  requestPurchase,
  Sku,
  useIAP,
} from 'react-native-iap'
import * as Sentry from 'sentry-expo'
import { nativeToWebMessageType } from 'common/src/native-message'

const SKUS = ['mana_1000', 'mana_2500', 'mana_10000']
export const IosIapListener = (props: {
  checkoutAmount: number | null
  setCheckoutAmount: (amount: number | null) => void
  communicateWithWebview: (type: nativeToWebMessageType, data: object) => void
}) => {
  const { checkoutAmount, setCheckoutAmount, communicateWithWebview } = props
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
      console.log('error with products:', products)
      if (currentPurchaseError) {
        console.log('current purchase error', currentPurchaseError)
        console.log('currentPurchase:', currentPurchase)
        setDidGetPurchaseError('currentPurchaseError')
      } else if (initConnectionError) {
        console.log('init connection error', initConnectionError)
        setDidGetPurchaseError('initConnectionError')
      }

      getAvailablePurchases()
      Sentry.Native.captureException('error on purchase or connection', {
        extra: {
          message: currentPurchaseError
            ? 'currentPurchaseError'
            : 'initConnectionError',
          products,
          currentPurchase,
          currentPurchaseError,
          initConnectionError,
        },
      })
      communicateWithWebview('iapError', {})
    }
  }, [currentPurchaseError, initConnectionError])

  useEffect(() => {
    if (availablePurchases.length > 0) {
      console.log('availablePurchases', availablePurchases)
      Sentry.Native.captureException('got available purchases', {
        extra: {
          message: `available purchases after error? ${didGetPurchaseError}`,
          didGetPurchaseError,
          availablePurchases,
        },
      })
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
            Sentry.Native.captureException(
              'receipt received after error on purchase or connection',
              {
                extra: {
                  message: `receipt received after ${didGetPurchaseError}`,
                },
              }
            )
          }

          communicateWithWebview('iapReceipt', { receipt })
        }
      } catch (error) {
        Sentry.Native.captureException(error, {
          extra: { message: 'error during purchase' },
        })
        if (error instanceof PurchaseError) {
          console.log({ message: `[${error.code}]: ${error.message}`, error })
        } else {
          console.log({ message: 'handleBuyProduct', error })
        }
      }
    }

    checkCurrentPurchase()
  }, [currentPurchase, finishTransaction])

  const handleBuyProduct = async (sku: Sku) => {
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
    if (connected) {
      getProducts({
        skus: SKUS,
      }).catch((e) => {
        console.log('getProducts error', e)
        Sentry.Native.captureException(e, {
          extra: { message: 'error getting products' },
        })
      })
    }
  }, [connected])

  useEffect(() => {
    if (!checkoutAmount) return
    console.log('checkoutAmount', checkoutAmount)
    const usdAmount = (checkoutAmount / 100).toString()
    console.log('usdAmount', usdAmount)
    const sku = products.find((p) => p.price === usdAmount)
    if (sku) {
      console.log('found sku', sku)
      handleBuyProduct(sku.productId)
    }
    setCheckoutAmount(null)
  }, [checkoutAmount])

  return <View />
}
