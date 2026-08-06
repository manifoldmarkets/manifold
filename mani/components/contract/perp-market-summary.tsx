import { LiteMarket } from 'common/api/market-types'
import { getPerpBackingPool } from 'common/perps/amm'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { ThemedText } from 'components/themed-text'
import { TokenNumber } from 'components/token/token-number'
import { Rounded } from 'constants/border-radius'
import { blue } from 'constants/colors'
import { useColor } from 'hooks/use-color'

export type PerpSummaryMarket = Pick<
  LiteMarket,
  | 'isResolved'
  | 'maxLeverage'
  | 'oraclePrice'
  | 'oracleSourceTime'
  | 'poolLong'
  | 'poolShort'
  | 'resolvedOraclePrice'
>

export function PerpMarketSummary(props: {
  market: PerpSummaryMarket
  compact?: boolean
}) {
  const { market, compact = false } = props
  const color = useColor()
  const resolvedPrice = isFiniteNumber(market.resolvedOraclePrice)
    ? market.resolvedOraclePrice
    : undefined
  const currentPrice = isFiniteNumber(market.oraclePrice)
    ? market.oraclePrice
    : undefined
  const price = market.isResolved ? resolvedPrice ?? currentPrice : currentPrice
  const formattedPrice = isFiniteNumber(price)
    ? formatPrice(price, inferPriceDecimals([price]))
    : 'Unavailable'
  const poolLong = market.poolLong
  const poolShort = market.poolShort
  const hasValidBacking =
    isFiniteNonNegativeNumber(poolLong) && isFiniteNonNegativeNumber(poolShort)
  const backing = hasValidBacking
    ? getPerpBackingPool(poolLong, poolShort)
    : undefined

  if (compact) {
    return (
      <Row
        style={{
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Col style={{ gap: 2 }}>
          <ThemedText color={blue[400]} size="xs" weight="bold">
            PERPETUAL
          </ThemedText>
          {backing !== undefined && (
            <Row style={{ alignItems: 'center', gap: 4 }}>
              <TokenNumber
                amount={backing}
                token="MANA"
                size="sm"
                color={color.textTertiary}
                shortened
              />
              <ThemedText color={color.textQuaternary} size="sm">
                backing
              </ThemedText>
            </Row>
          )}
        </Col>
        <Col style={{ alignItems: 'flex-end' }}>
          <ThemedText family="JetBrainsMono" size="xl" weight="semibold">
            {formattedPrice}
          </ThemedText>
          <ThemedText color={color.textTertiary} size="xs">
            {market.isResolved ? 'settlement price' : 'oracle price'}
          </ThemedText>
        </Col>
      </Row>
    )
  }

  const sourceTime = isFiniteNumber(market.oracleSourceTime)
    ? new Date(market.oracleSourceTime).toLocaleString()
    : undefined

  return (
    <Col
      style={{
        gap: 14,
        padding: 16,
        borderRadius: Rounded.lg,
        borderColor: color.borderSecondary,
        borderWidth: 1,
        backgroundColor: color.backgroundSecondary,
      }}
    >
      <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <ThemedText color={blue[400]} size="sm" weight="bold">
          PERPETUAL FUTURES
        </ThemedText>
        <ThemedText color={color.textTertiary} size="sm">
          {market.isResolved ? 'Settled' : 'Read-only in app'}
        </ThemedText>
      </Row>

      <Col>
        <ThemedText family="JetBrainsMono" size="4xl" weight="semibold">
          {formattedPrice}
        </ThemedText>
        <ThemedText color={color.textTertiary} size="sm">
          {market.isResolved ? 'Settlement price' : 'Current oracle price'}
        </ThemedText>
      </Col>

      <Row style={{ alignItems: 'flex-end', gap: 28 }}>
        <Col style={{ gap: 2 }}>
          <ThemedText color={color.textTertiary} size="xs">
            Backing pool
          </ThemedText>
          {backing === undefined ? (
            <ThemedText size="md">Unavailable</ThemedText>
          ) : (
            <TokenNumber amount={backing} token="MANA" size="md" shortened />
          )}
        </Col>
        {isFiniteNumber(market.maxLeverage) && (
          <Col style={{ gap: 2 }}>
            <ThemedText color={color.textTertiary} size="xs">
              Maximum leverage
            </ThemedText>
            <ThemedText family="JetBrainsMono" size="md">
              {market.maxLeverage}x
            </ThemedText>
          </Col>
        )}
      </Row>

      {sourceTime && (
        <ThemedText color={color.textQuaternary} size="xs">
          Oracle data as of {sourceTime}
        </ThemedText>
      )}
    </Col>
  )
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isFiniteNonNegativeNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0
