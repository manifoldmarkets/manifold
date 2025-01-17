import {
  View,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  TextInput,
} from 'react-native'
import { useState } from 'react'
import { JSONContent } from './content-renderer'
import { fontSizes, ThemedText } from 'components/themed-text'
import { Row } from 'components/layout/row'
import { useColor } from 'hooks/use-color'
import { AvatarCircle } from 'components/user/avatar-circle'
import { useUser } from 'hooks/use-user'
import { PAGE_PADDING } from 'components/page'
import { Rounded } from 'constants/border-radius'
import { IconSymbol } from 'components/ui/icon-symbol'
import { api } from 'lib/api'

const HORIZONTAL_PADDING = 16

export function ContentEditor(props: { contractId: string }) {
  const { contractId } = props
  const [text, setText] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const user = useUser()
  const color = useColor()
  // const editor = useEditorBridge()

  const handleTextChange = (newText: string) => {
    setText(newText)

    // Convert to JSONContent format
    const content: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: newText,
            },
          ],
        },
      ],
    }
  }
  if (!user) return null

  const { avatarUrl, username } = user

  return (
    <>
      {isExpanded && (
        <TouchableWithoutFeedback onPress={() => setIsExpanded(false)}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      )}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{
          position: 'fixed', // or 'absolute' depending on your needs
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: color.background,
          paddingVertical: 12,
          paddingHorizontal: PAGE_PADDING,
        }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 72 : 0}
      >
        {!isExpanded ? (
          // Collapsed state - show single line input
          <Row
            style={{
              width: '100%',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <AvatarCircle avatarUrl={avatarUrl} username={username} />
            <TouchableOpacity
              onPress={() => setIsExpanded(true)}
              style={{
                flex: 1,
                height: 40,
                backgroundColor: color.backgroundSecondary,
                borderRadius: Rounded['2xl'],
                justifyContent: 'center',
                paddingHorizontal: HORIZONTAL_PADDING,
              }}
            >
              <ThemedText size="sm" color={color.textTertiary}>
                Add a comment...
              </ThemedText>
            </TouchableOpacity>
          </Row>
        ) : (
          // Expanded state - show full textarea and buttons
          <View style={{ gap: 8, width: '100%' }}>
            <Row style={{ gap: 8 }}>
              <AvatarCircle
                avatarUrl={avatarUrl}
                username={username}
                style={{ paddingTop: 8 }}
              />
              <TextInput
                multiline
                autoFocus
                placeholder="Add a comment..."
                placeholderTextColor={color.textTertiary}
                style={{
                  minHeight: 40,
                  maxHeight: 80,
                  flex: 1,
                  backgroundColor: color.backgroundSecondary,
                  borderRadius: Rounded['2xl'],
                  paddingHorizontal: HORIZONTAL_PADDING,
                  color: color.text,
                  textAlignVertical: 'center',
                  fontSize: fontSizes.sm.fontSize,
                  lineHeight: fontSizes.sm.lineHeight,
                }}
                value={text}
                onChangeText={handleTextChange}
              />
              {/* <RichText editor={editor} /> */}
            </Row>
            <Row style={{ justifyContent: 'flex-end', gap: 8 }}>
              {/* TODO: ability to add tags and pictures */}
              <TouchableOpacity
                onPress={() => {
                  try {
                    api('comment', {
                      markdown: text,
                      contractId,
                    })
                    setIsExpanded(false)
                    setText('')
                  } catch (error) {
                    console.error(error)
                  }
                }}
              >
                <IconSymbol
                  name="paperplane.fill"
                  color={color.primaryButton}
                />
              </TouchableOpacity>
            </Row>
          </View>
        )}
      </KeyboardAvoidingView>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 8,
  },
  input: {
    minHeight: 100,
  },
})
