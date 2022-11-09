import { useEffect, useState } from 'react'
import { Modal, Text, View, StyleSheet } from 'react-native'
import {
  isIosStorekit2,
  PurchaseError,
  requestPurchase,
  Sku,
  useIAP,
} from 'react-native-iap'

const SKUS = ['mana_1000', 'mana_2500', 'mana_10000']
export const IAP = (props: {
  checkoutAmount: number | null
  setCheckoutAmount: (amount: number | null) => void
}) => {
  const { checkoutAmount, setCheckoutAmount } = props

  const {
    connected,
    products,
    currentPurchase,
    currentPurchaseError,
    initConnectionError,
    finishTransaction,
    getProducts,
  } = useIAP()
  const [error, setError] = useState<boolean>(false)
  const [success, setSuccess] = useState(false)
  const init = async () => {
    console.log('init')
    try {
      await getProducts({
        skus: SKUS,
      })
    } catch (e) {
      console.log('getProducts error', e)
    }
  }

  useEffect(() => {
    if (currentPurchaseError || initConnectionError) {
      setError(true)
      console.log('currentPurchaseError', currentPurchaseError)
      console.log('initConnectionError', initConnectionError)
    } else setError(false)
  }, [currentPurchaseError, initConnectionError])

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
          console.log(
            'finishTransaction receipt',
            currentPurchase.transactionReceipt
          )

          setSuccess(true)
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
    console.log('products available:', products)
  }, [products])

  useEffect(() => {
    console.log('connected', connected)
    if (connected) init()
  }, [connected])

  useEffect(() => {
    if (!checkoutAmount) return
    console.log('checkoutAmount', checkoutAmount)
    const usdAmount = (checkoutAmount / 100).toString()
    console.log('usdAmount', usdAmount)
    const sku = products.find((p) => p.price === usdAmount)
    if (sku) {
      handleBuyProduct(sku.productId)
      // purchase package found, make purchase
    }
    setCheckoutAmount(null)
  }, [checkoutAmount])

  return (
    <View>
      {/*<Modal*/}
      {/*  visible={!!initConnectionError}*/}
      {/*  onRequestClose={() => setError(false)}*/}
      {/*>*/}
      {/*  <Text style={styles.errorMessage}>*/}
      {/*    An error happened while initiating the connection.*/}
      {/*  </Text>*/}
      {/*</Modal>*/}

      {/*{currentPurchaseError && (*/}
      {/*  <Modal*/}
      {/*    visible={!!currentPurchaseError && error}*/}
      {/*    animationType="slide"*/}
      {/*    transparent={true}*/}
      {/*    onRequestClose={() => setError(false)}*/}
      {/*  >*/}
      {/*    <Text style={styles.errorMessage}>*/}
      {/*      code: {currentPurchaseError.code}, message:{' '}*/}
      {/*      {currentPurchaseError.message}*/}
      {/*    </Text>*/}
      {/*  </Modal>*/}
      {/*)}*/}

      {/*{success && (*/}
      {/*  <Modal visible={success}>*/}
      {/*    <Text style={styles.successMessage}>*/}
      {/*      A product purchase has been processed successfully.*/}
      {/*    </Text>*/}
      {/*  </Modal>*/}
      {/*)}*/}
    </View>
  )
}
const styles = StyleSheet.create({
  errorMessage: {
    color: 'red',
  },

  successMessage: {
    color: 'green',
  },

  container: {
    marginBottom: 20,
  },
})
