import { useState } from 'react'
import Page from 'components/page'
import { ThemedText } from 'components/themed-text'
import { useUser, usePrivateUser } from 'hooks/use-user'
import { useRouter } from 'expo-router'
import { Button } from 'components/buttons/button'
import {
  View,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native'
import { Row } from 'components/layout/row'
import { Col } from 'components/layout/col'
import { Colors } from 'constants/colors'
import { PaymentAmount } from 'common/economy'
import { introductoryTimeWindow, User } from 'common/user'
import { formatMoneyUSD } from 'common/util/format'
import { getVerificationStatus } from 'common/gidx/user'
import { Rounded } from 'constants/border-radius'
import { CoinNumber } from 'components/widgets/coin-number'
import { usePrices } from 'hooks/use-prices'
import { shortenNumber } from 'common/util/formatNumber'
import { Image } from 'react-native'
import buyMana10k from '../../assets/images/buy-mana-graphics/10k.png'
import buyMana25k from '../../assets/images/buy-mana-graphics/25k.png'
import buyMana100k from '../../assets/images/buy-mana-graphics/100k.png'
import buyMana1M from '../../assets/images/buy-mana-graphics/1M.png'
import { IosIapListener } from 'components/ios-iap-listener'

export default function Shop() {
  const user = useUser()
  const privateUser = usePrivateUser()
  const router = useRouter()
  const [loadingPrice, setLoadingPrice] = useState<PaymentAmount | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkoutAmount, setCheckoutAmount] = useState<PaymentAmount | null>(
    null
  )

  const basePrices = usePrices()
  const expirationStart = user
    ? new Date(introductoryTimeWindow(user))
    : new Date()

  const eligibleForNewUserOffer =
    user && Date.now() < expirationStart.valueOf() && !user.purchasedSweepcash

  const newUserPrices = basePrices.filter((p: PaymentAmount) => p.newUsersOnly)
  const prices = basePrices.filter((p: PaymentAmount) => !p.newUsersOnly)

  if (!user?.idVerified || !user?.sweepstakesVerified) {
    return (
      <Page>
        <View style={styles.container}>
          <ThemedText style={styles.title}>
            Identity Verification Required
          </ThemedText>
          <ThemedText style={styles.message}>
            To participate in sweepstakes and access the shop, you need to
            verify your identity first.
          </ThemedText>
          <Button
            title="Start Verification"
            onPress={() => router.push('/registration')}
          />
        </View>
      </Page>
    )
  }

  const onSelectPriceInDollars = (dollarAmount: PaymentAmount) => {
    if (!user || !privateUser) return
    const { status, message } = getVerificationStatus(user, privateUser)
    if (status !== 'error') {
      setCheckoutAmount(dollarAmount)
    } else {
      setError(message)
    }
    setLoadingPrice(dollarAmount)
  }

  return (
    <Page>
      <Col style={styles.content}>
        <Row style={styles.header}>
          <ThemedText style={styles.headerTitle}>Mana Shop</ThemedText>
        </Row>

        <ThemedText size="xs" style={styles.description}>
          Buy mana to trade in your favorite questions. Only sweepcash won from
          sweepstakes questions is redeemable for cash. Always free to play, no
          purchase necessary.
        </ThemedText>

        {eligibleForNewUserOffer && (
          <>
            <ThemedText style={styles.welcomeDeal}>Welcome Deal</ThemedText>
            <View style={styles.priceGrid}>
              {newUserPrices.map((amounts: PaymentAmount, index: number) => (
                <PriceTile
                  key={`price-tile-${amounts.mana}`}
                  amounts={amounts}
                  loadingPrice={loadingPrice}
                  user={user}
                  index={index}
                  onPress={() => onSelectPriceInDollars(amounts)}
                />
              ))}
            </View>
          </>
        )}

        <View style={styles.priceGrid}>
          {prices
            .sort(
              (a: PaymentAmount, b: PaymentAmount) =>
                a.bonusInDollars - b.bonusInDollars
            )
            .map((amounts: PaymentAmount, index: number) => (
              <PriceTile
                key={`price-tile-${amounts.mana}`}
                amounts={amounts}
                loadingPrice={loadingPrice}
                user={user}
                index={index}
                onPress={() => onSelectPriceInDollars(amounts)}
              />
            ))}
        </View>

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <ThemedText style={styles.terms}>
          Please see our Terms & Conditions, Mana-only Terms of Service, and
          Sweepstakes Rules. All sales are final. No refunds.
        </ThemedText>

        {Platform.OS === 'ios' && (
          <IosIapListener
            checkoutAmount={checkoutAmount}
            setCheckoutAmount={setCheckoutAmount}
            setLoading={setLoadingPrice}
            setError={(error: string) => {
              setError(error)
              setCheckoutAmount(null)
              setLoadingPrice(null)
            }}
          />
        )}
      </Col>
    </Page>
  )
}
const BUY_MANA_GRAPHICS = [buyMana10k, buyMana25k, buyMana100k, buyMana1M]

function PriceTile(props: {
  amounts: PaymentAmount
  loadingPrice: PaymentAmount | null
  user: User | null
  index: number
  onPress: () => void
}) {
  const { amounts, loadingPrice, onPress, index } = props
  const isLoading = loadingPrice?.priceInDollars === amounts.priceInDollars
  const imgSrc =
    BUY_MANA_GRAPHICS[Math.min(index, BUY_MANA_GRAPHICS.length - 1)]
  return (
    <TouchableOpacity
      style={styles.priceTile}
      onPress={onPress}
      disabled={isLoading}
    >
      <Col style={styles.priceTileContent}>
        <Image
          source={imgSrc}
          alt={`${shortenNumber(amounts.mana)} mana`}
          style={{ width: 120, height: 120 }}
        />
        <Row style={styles.priceTileHeader}>
          <CoinNumber amount={amounts.mana} token="MANA" />
          {amounts.bonusInDollars > 0 && (
            <>
              <ThemedText style={styles.plus}> + </ThemedText>
              <CoinNumber amount={amounts.bonusInDollars} token="CASH" />
            </>
          )}
        </Row>
        <ThemedText style={styles.price}>
          {formatMoneyUSD(amounts.priceInDollars)}
        </ThemedText>
        {isLoading && (
          <ActivityIndicator
            size="small"
            color="#4F46E5"
            style={styles.loader}
          />
        )}
      </Col>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  content: {
    paddingVertical: 16,
    gap: 16,
  },
  header: {
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  description: {
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  welcomeDeal: {
    fontSize: 24,
    color: '#22C55E',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  priceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 16,
  },
  priceTile: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: Rounded.md,
    padding: 14,
  },
  priceTileContent: {
    gap: 8,
    alignItems: 'center',
  },
  priceTileHeader: {
    gap: 4,
    alignItems: 'center',
  },
  plus: {
    color: Colors.textSecondary,
  },
  price: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  loader: {
    marginTop: 8,
  },
  error: {
    color: Colors.error,
    textAlign: 'center',
  },
  specialOffer: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: Rounded.md,
    marginTop: 16,
  },
  specialOfferText: {
    color: Colors.text,
  },
  terms: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
})
