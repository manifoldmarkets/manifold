import {
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  type ProductPurchase,
  type PurchaseError,
  flushFailedPurchasesCachedAsPendingAndroid,
  endConnection,
  getProducts,
  requestPurchase,
  Product,
  useIAP,
  getAvailablePurchases,
} from 'react-native-iap'
import { useEffect, useState } from 'react'
import * as Sentry from 'sentry-expo'
import { EmitterSubscription, Pressable, Text, View } from 'react-native'

export const IAP = () => {
  const {
    connected,
    products,
    subscriptions,
    getProducts,
    getSubscriptions,
    currentPurchase,
    currentPurchaseError,
  } = useIAP()

  // let purchaseUpdateSubscription: EmitterSubscription | null = null
  // let purchaseErrorSubscription: EmitterSubscription | null = null
  const init = async () => {
    console.log('init')
    // try {
    //   const availablePurchases = await getAvailablePurchases()
    //   console.log('availablePurchases', availablePurchases)
    // } catch (e) {
    //   console.log('availablePurchases error', e)
    // }
    try {
      await getProducts({
        skus: ['6444268147'],
      })
    } catch (e) {
      console.log('getProducts error', e)
    }
  }

  useEffect(() => {
    console.log(products)
  }, [products])
  useEffect(() => {
    console.log('connected', connected)
    if (connected) init()
  }, [connected])

  useEffect(() => {
    // try {
    //   initConnection().then(() => {
    //     // we make sure that "ghost" pending payment are removed
    //     // (ghost = failed pending payment that are still marked as pending in Google's native Vending module cache)
    //     flushFailedPurchasesCachedAsPendingAndroid()
    //       .catch(() => {
    //         // exception can happen here if:
    //         // - there are pending purchases that are still pending (we can't consume a pending purchase)
    //         // in any case, you might not want to do anything special with the error
    //       })
    //       .then(() => {
    //         purchaseUpdateSubscription = purchaseUpdatedListener(
    //           (purchase: ProductPurchase) => {
    //             console.log('purchaseUpdatedListener', purchase)
    //             const receipt = purchase.transactionReceipt
    //             if (receipt) {
    //               // yourAPI
    //               //   .deliverOrDownloadFancyInAppPurchase(
    //               //     purchase.transactionReceipt,
    //               //   )
    //               //   .then(async (deliveryResult) => {
    //               //     if (isSuccess(deliveryResult)) {
    //               //       // Tell the store that you have delivered what has been paid for.
    //               //       // Failure to do this will result in the purchase being refunded on Android and
    //               //       // the purchase event will reappear on every relaunch of the app until you succeed
    //               //       // in doing the below. It will also be impossible for the user to purchase consumables
    //               //       // again until you do this.
    //               //
    //               //       // If consumable (can be purchased again)
    //               //       await finishTransaction({purchase, isConsumable: true});
    //               //       // If not consumable
    //               //       await finishTransaction({purchase, isConsumable: false});
    //               //     } else {
    //               //       // Retry / conclude the purchase is fraudulent, etc...
    //               //     }
    //               //   });
    //             }
    //           }
    //         )
    //
    //         purchaseErrorSubscription = purchaseErrorListener(
    //           (error: PurchaseError) => {
    //             console.warn('purchaseErrorListener', error)
    //           }
    //         )
    //       })
    //   })
    // } catch (err) {
    //   console.log('error initializing iap', err)
    //   Sentry.Native.captureException(err, {
    //     extra: { message: 'iap connection' },
    //   })
    // }
    // return () => {
    //   endConnection()
    //   if (purchaseUpdateSubscription) {
    //     purchaseUpdateSubscription.remove()
    //     purchaseUpdateSubscription = null
    //   }
    //
    //   if (purchaseErrorSubscription) {
    //     purchaseErrorSubscription.remove()
    //     purchaseErrorSubscription = null
    //   }
    // }
  }, [])

  const requestPurchaseTrigger = async () => {
    console.log('product', products)
    const product = products[0].productId
    try {
      await requestPurchase({
        sku: product,
        andDangerouslyFinishTransactionAutomaticallyIOS: false,
      })
    } catch (err: any) {
      console.warn(err.code, err.message)
    }
  }
  return (
    <View
      style={{
        height: 100,
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Pressable onPress={() => requestPurchaseTrigger()}>
        <Text>BUY ME</Text>
      </Pressable>
    </View>
  )
}
