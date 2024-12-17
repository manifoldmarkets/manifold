import { Row } from 'components/layout/row'
import { BinaryProbability } from '../Probability'
import { BinaryContract } from 'common/contract'
import { ThemedText } from 'components/ThemedText'

export function BinaryOverview({ contract }: { contract: BinaryContract }) {
  return (
    <Row
      style={{
        alignItems: 'center',
        gap: 8,
      }}
    >
      <BinaryProbability contract={contract} size="3xl" />
      <ThemedText size="xl">chance</ThemedText>
    </Row>
  )
}
