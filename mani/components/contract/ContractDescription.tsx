import { Contract } from 'common/contract'
import { ContentRenderer } from 'components/content/ContentRenderer'
import {
  extractTextFromContent,
  isEmptyDescription,
} from 'components/content/contentUtils'
import { Col } from 'components/layout/col'
import { ExpandableContent } from 'components/layout/ExpandableContent'
import { ThemedText } from 'components/ThemedText'
import { useColor } from 'hooks/useColor'

export function ContractDescription({ contract }: { contract: Contract }) {
  const color = useColor()
  const description = contract.description
  if (!description || isEmptyDescription(contract.description)) {
    return null
  }
  return (
    <ExpandableContent
      previewContent={
        <>
          <ThemedText size="md" weight="bold">
            Description
          </ThemedText>
          <ThemedText size="sm" numberOfLines={3} color={color.textSecondary}>
            {extractTextFromContent(contract.description)}
          </ThemedText>
        </>
      }
      modalContent={
        <Col style={{ gap: 16 }}>
          <ThemedText size="lg" weight="semibold">
            Description
          </ThemedText>
          <ContentRenderer content={contract.description} />
        </Col>
      }
    />
  )
}
