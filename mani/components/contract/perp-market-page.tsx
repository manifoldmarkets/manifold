import { openBrowserAsync } from 'expo-web-browser'

import { FullMarket, LiteMarket } from 'common/api/market-types'
import { Button } from 'components/buttons/button'
import { Col } from 'components/layout/col'
import Page from 'components/page'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'

import { PerpMarketSummary } from './perp-market-summary'

export type PerpApiMarket = (LiteMarket | FullMarket) & {
  mechanism: 'perp'
  outcomeType: 'PERP'
}

export const isPerpApiMarket = (
  market: LiteMarket | FullMarket
): market is PerpApiMarket =>
  market.mechanism === 'perp' && market.outcomeType === 'PERP'

export function PerpMarketPage({ market }: { market: PerpApiMarket }) {
  const color = useColor()
  const description =
    'textDescription' in market ? market.textDescription.trim() : ''

  return (
    <Page>
      <Col style={{ gap: 16, paddingTop: 16 }}>
        <ThemedText
          size={market.question.length > 95 ? 'xl' : '2xl'}
          weight="semibold"
        >
          {market.question}
        </ThemedText>

        <PerpMarketSummary market={market} />

        <ThemedText color={color.warning} size="sm">
          {market.isResolved
            ? 'Charts and settlement history are available on the full web market.'
            : 'Perpetual trading, charts, and position management are currently available on the full web market.'}
        </ThemedText>
        <Button
          title="Open full market"
          variant="purple"
          size="lg"
          onPress={() => openBrowserAsync(market.url)}
        />

        {description.length > 0 && (
          <Col style={{ gap: 8, paddingTop: 8 }}>
            <ThemedText size="md" weight="bold">
              Description
            </ThemedText>
            <ThemedText color={color.textSecondary} size="md">
              {description}
            </ThemedText>
          </Col>
        )}
      </Col>
    </Page>
  )
}
