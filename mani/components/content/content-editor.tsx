import {
  TextInput,
  View,
  StyleSheet,
  TouchableOpacity,
  Button,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useState } from 'react'
import { JSONContent } from './content-renderer'
import { ThemedText } from 'components/themed-text'
import { Row } from 'components/layout/row'
import { useColor } from 'hooks/use-color'

type EditorProps = {
  onChange: (content: JSONContent) => void
  initialContent?: JSONContent
}

export function ContentEditor({ onChange, initialContent }: EditorProps) {
  const [text, setText] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const color = useColor()

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

    onChange(content)
  }

  return (
    // <View style={styles.container}>
    //   <TextInput
    //     multiline
    //     value={text}
    //     onChangeText={handleTextChange}
    //     style={styles.input}
    //   />
    //   {/* Add formatting buttons here */}
    // </View>
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{
        position: 'fixed', // or 'absolute' depending on your needs
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'white',
        borderTopWidth: 1,
        borderTopColor: '#e5e5e5',
        padding: 12,
        // Add shadow if desired
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 5,
      }}
    >
      {!isExpanded ? (
        // Collapsed state - show single line input
        <TouchableOpacity
          onPress={() => setIsExpanded(true)}
          style={{
            height: 40,
            backgroundColor: '#f0f0f0',
            borderRadius: 20,
            paddingHorizontal: 16,
            justifyContent: 'center',
          }}
        >
          <ThemedText size="sm" color={color.textSecondary}>
            Add a comment...
          </ThemedText>
        </TouchableOpacity>
      ) : (
        // Expanded state - show full textarea and buttons
        <View style={{ gap: 8 }}>
          <TextInput
            multiline
            autoFocus
            placeholder="Add a comment..."
            style={{
              height: 100,
              backgroundColor: '#f0f0f0',
              borderRadius: 12,
              padding: 12,
            }}
            value={text}
            onChangeText={handleTextChange}
          />
          <Row style={{ justifyContent: 'flex-end', gap: 8 }}>
            <Button
              onPress={() => setIsExpanded(false)}
              title="Cancel"
              color="gray"
            />
            <Button
              onPress={() => {
                // Handle submit
                setIsExpanded(false)
              }}
              title="Reply"
            />
          </Row>
        </View>
      )}
    </KeyboardAvoidingView>
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
