import { ContractComment } from 'common/comment'
import { ContentRenderer } from 'components/content/ContentRenderer'
import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { ThemedText } from 'components/themed-text'
import { ReactNode } from 'react'
import { Image, TouchableOpacity } from 'react-native'

import { fromNow } from 'util/time'
import { IconSymbol } from 'components/ui/icon-symbol'
import { useColor } from 'hooks/use-color'

export function Comment({
  comment,
  line,
  replyButton,
}: {
  comment: ContractComment
  isParent?: boolean
  line?: boolean
  replyButton?: ReactNode
}) {
  const { userUsername, userAvatarUrl, userId } = comment
  const color = useColor()
  return (
    <Col style={{ width: '100%' }}>
      <Row style={{ gap: 8, flexShrink: 1 }}>
        <Col style={{ width: 24, alignItems: 'center' }}>
          {line && (
            <Col
              style={{
                width: 1,
                flex: 1,
                backgroundColor: color.borderSecondary,

                position: 'absolute',
                top: 0,
                bottom: 0,
              }}
            />
          )}
          <Image
            style={{
              width: 24,
              height: 24,
              borderRadius: 24,
            }}
            src={userAvatarUrl}
            alt={`${userUsername} avatar`}
          />
        </Col>
        <Col style={{ flexShrink: 1, flex: 1, gap: 4 }}>
          <Row
            style={{
              gap: 8,
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <ThemedText size="md" color={color.textTertiary}>
              {userUsername}
            </ThemedText>
            <ThemedText size="sm" color={color.textQuaternary}>
              {fromNow(comment.createdTime, true)}
            </ThemedText>
          </Row>
          <ContentRenderer content={comment.content} />
          <Row
            style={{
              width: '100%',
              justifyContent: replyButton ? 'space-between' : 'flex-end',
              alignItems: 'center',
              paddingBottom: 16,
            }}
          >
            {replyButton}

            {/* TODO: implement likes and dislikes */}
            <Row style={{ gap: 16 }}>
              <TouchableOpacity onPress={() => {}}>
                <ThemedText size="md" color={color.textTertiary}>
                  <IconSymbol
                    name="hand.thumbsup"
                    size={16}
                    color={color.textTertiary}
                  />
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {}}>
                <ThemedText size="md" color={color.textTertiary}>
                  <IconSymbol
                    name="hand.thumbsdown"
                    size={16}
                    color={color.textTertiary}
                  />
                </ThemedText>
              </TouchableOpacity>
            </Row>
          </Row>
        </Col>
      </Row>
    </Col>
  )
}
