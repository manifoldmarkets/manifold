import { Contract } from 'common/contract'
import { Col } from 'components/layout/col'
import { ThemedText } from 'components/themed-text'
import { TokenNumber } from 'components/token/token-number'
import { Button } from 'components/buttons/button'
import { useColor } from 'hooks/use-color'

type SaleDetails = {
  amount: number
  saleValue: number
  profit: number
}

export function PositionModalConfirmation({
  contract,
  saleDetails,
  setOpen,
}: {
  contract: Contract
  saleDetails: SaleDetails
  setOpen: (open: boolean) => void
}) {
  const color = useColor()
  const isCashContract = contract.token === 'CASH'

  return (
    <Col
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 24,
      }}
    >
      <Col style={{ alignItems: 'center', gap: 8 }}>
        <ThemedText size="2xl" weight="semibold">
          🎉 Sale successful!
        </ThemedText>
      </Col>

      <Col style={{ gap: 16, width: '100%', alignItems: 'center' }}>
        <Col style={{ alignItems: 'center', gap: 4 }}>
          <ThemedText color={color.textTertiary}>Sale value</ThemedText>
          <TokenNumber amount={saleDetails.saleValue} size="3xl" />
        </Col>

        <Col style={{ alignItems: 'center', gap: 4 }}>
          <ThemedText color={color.textTertiary}>Profit</ThemedText>
          <TokenNumber amount={saleDetails.profit} size="3xl" />
        </Col>
      </Col>

      <Button
        onPress={() => setOpen(false)}
        style={{ width: '100%' }}
        size="lg"
        variant="primary"
      >
        Done
      </Button>
    </Col>
  )
}
