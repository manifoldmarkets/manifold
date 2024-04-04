import { formatMoney } from 'common/util/format'
import { useState, useEffect } from 'react'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { useUser } from 'web/hooks/use-user'
import { validateIapReceipt } from 'web/lib/firebase/api'
import { getNativePlatform } from 'web/lib/native/is-native'
import { postMessageToNative } from 'web/lib/native/post-message'
import { checkoutURL } from 'web/lib/service/stripe'
import { IOS_PRICES, WEB_PRICES } from 'web/pages/add-funds'
import { Button } from './buttons/button'
import { Row } from './layout/row'
import { Col } from './layout/col'

export function BuyManaButton(props: { amount: 1000 | 2500 | 10000 | 100000 }) {
  const user = useUser()
  const { isNative, platform } = getNativePlatform()
  const prices = isNative && platform === 'ios' ? IOS_PRICES : WEB_PRICES
  const amount = prices[formatMoney(props.amount)]

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const handleIapReceipt = async (type: string, data: any) => {
    if (type === 'iapReceipt') {
      const { receipt } = data
      try {
        await validateIapReceipt({ receipt: receipt })
        console.log('iap receipt validated')
      } catch (e) {
        console.log('iap receipt validation error', e)
        setError('Error validating receipt')
      }
    } else if (type === 'iapError') {
      setError('Error during purchase! Try again.')
    }
    setLoading(false)
  }
  useNativeMessages(['iapReceipt', 'iapError'], handleIapReceipt)

  const [url, setUrl] = useState('https://manifold.markets')
  useEffect(() => setUrl(window.location.href), [])

  return (
    <Col>
      {isNative && platform === 'ios' ? (
        <Button
          color={'gradient'}
          loading={loading}
          onClick={() => {
            setError(null)
            setLoading(true)
            postMessageToNative('checkout', { amount })
          }}
        >
          Continue to pay ${amount / 100}
        </Button>
      ) : (
        <form action={checkoutURL(user?.id || '', amount, url)} method="POST">
          <Button type="submit" color="gradient">
            Continue to pay ${amount / 100}
          </Button>
        </form>
      )}
      <Row className="text-error mt-2 text-sm">{error}</Row>
    </Col>
  )
}
