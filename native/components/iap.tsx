import { useEffect, useState } from 'react'
import * as Sentry from 'sentry-expo'
import { Platform, Pressable, Text, View } from 'react-native'
import Purchases, { PurchasesPackage } from 'react-native-purchases'

export const IAP = (props: {
  checkoutAmount: number | null
  setCheckoutAmount: (amount: number | null) => void
}) => {
  const { checkoutAmount, setCheckoutAmount } = props
  const [purchasePackages, setPurchasePackages] = useState<PurchasesPackage[]>(
    []
  )
  const [error, setError] = useState<string | null>(null)

  const makePurchase = async (purchasePackage: PurchasesPackage) => {
    try {
      const { customerInfo, productIdentifier } =
        await Purchases.purchasePackage(purchasePackage)
      console.log(
        'customerInfo',
        customerInfo,
        'productIdentifier',
        productIdentifier
      )
    } catch (e: any) {
      if (!e.userCancelled) {
        setError(e)
      }
    }
  }

  useEffect(() => {
    if (!checkoutAmount) return
    console.log('checkoutAmount', checkoutAmount)
    // find matching price in purchase packages
    const purchasePackage = purchasePackages.find(
      (p) => p.product.price === checkoutAmount
    )
    if (purchasePackage) {
      makePurchase(purchasePackage)
      // purchase package found, make purchase
    } else {
      setCheckoutAmount(null)
    }
  }, [checkoutAmount])

  const initPurchases = async () => {
    Purchases.setDebugLogsEnabled(true)

    if (Platform.OS === 'ios') {
      await Purchases.configure({ apiKey: 'appl_QuwcHjyniEBXcrOjwdckgjqAjUA' })
    }
    try {
      const offerings = await Purchases.getOfferings()
      if (
        offerings.current !== null &&
        offerings.current.availablePackages.length !== 0
      ) {
        // Display packages for sale
        console.log(offerings.current.availablePackages)
        setPurchasePackages(offerings.current.availablePackages)
      }
    } catch (e) {
      console.log(e)
    }
  }

  useEffect(() => {
    initPurchases()
  }, [])

  return <View />
}
