import { ContractComment } from 'common/comment'
import { ContentRenderer } from 'components/content/ContentRenderer'
import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { ThemedText } from 'components/ThemedText'
import { useColor } from 'hooks/useColor'
import { ReactNode } from 'react'
import { Image } from 'react-native'

export function Comment({
  comment,
  isParent,
  showParentLine,
  children,
}: {
  comment: ContractComment
  isParent?: boolean
  showParentLine?: boolean
  children?: ReactNode
}) {
  const { userUsername, userAvatarUrl, userId } = comment
  const color = useColor()
  return (
    <Col>
      <Row style={{ gap: 8 }}>
        <Image
          style={{
            width: 24,
            height: 24,
            borderRadius: 24,
          }}
          src={userAvatarUrl}
          alt={`${userUsername} avatar`}
        />
        <Col>
          <ThemedText size="md" color={color.textSecondary}>
            {userUsername}
          </ThemedText>
          <ContentRenderer content={comment.content} />
        </Col>
      </Row>
    </Col>
  )
}
