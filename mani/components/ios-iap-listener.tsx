import { useEffect, useState } from 'react'
import { View } from 'react-native'
import {
  isIosStorekit2,
  PurchaseError,
  requestPurchase,
  Sku,
  useIAP,
} from 'react-native-iap'

const SKUS = ['mana_1000', 'mana_2500', 'mana_10000'] // skus created before rate change

export const IosIapListener = (props: {
  checkoutAmount: number | null
  setCheckoutAmount: (amount: number | null) => void
}) => {
  const { checkoutAmount, setCheckoutAmount } = props
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
        console.error('currentPurchase:', currentPurchase)
        setDidGetPurchaseError('currentPurchaseError')
      } else if (initConnectionError) {
        console.error('init connection error', initConnectionError)
        setDidGetPurchaseError('initConnectionError')
      }

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
        }
      } catch (error) {
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
    console.log('checkoutAmount', checkoutAmount)
    const usdAmount = (checkoutAmount / 100).toString()
    console.log('usdAmount', usdAmount)
    const sku = products.find((p) => p.price === usdAmount)
    if (sku) {
      console.log('found sku', sku)
      handleBuyProduct(sku.productId)
    } else {
      console.error('no sku found for', usdAmount)
    }
    setCheckoutAmount(null)
  }, [checkoutAmount])

  return <View />
}
