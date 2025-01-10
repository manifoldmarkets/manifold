import { Image, Pressable, StyleSheet, View } from 'react-native'
import { Linking } from 'react-native'
// Your existing user link component
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import React from 'react'
import { Rounded } from 'constants/border-radius'

// Define the base node types
type NodeType =
  | 'paragraph'
  | 'bulletList'
  | 'listItem'
  | 'image'
  | 'mention'
  | 'text'
  | 'linkPreview'
  | 'iframe'
  | 'heading'
  | string

export type JSONContent = {
  type?: NodeType
  attrs?: Record<string, any>
  content?: JSONContent[]
  marks?: {
    type: string
    attrs?: Record<string, any>
    [key: string]: any
  }[]
  text?: string
  [key: string]: any
}

type ContentProps = {
  content: JSONContent | string
  style?: any
}

export function ContentRenderer({ content, style }: ContentProps) {
  const color = useColor()

  if (typeof content === 'string') {
    return (
      <ThemedText size="md" style={style}>
        {content}
      </ThemedText>
    )
  }

  return <RichContent content={content} style={style} />
}

function RichContent({
  content,
  style,
}: {
  content: JSONContent
  style?: any
}) {
  if (!content.content) return null

  return (
    <View style={style}>
      {content.content.map((node, index) => (
        <React.Fragment key={`root-${index}`}>
          {renderNode(node, `str-${index}`)}
        </React.Fragment>
      ))}
    </View>
  )
}

function renderNode(node: JSONContent, index: string): React.ReactNode {
  const color = useColor()
  switch (node.type) {
    case 'paragraph':
      return (
        <ThemedText size="md" key={`paragraph-${index}`}>
          {node.content?.map((child, i) => (
            <React.Fragment key={`paragraph-${index}-${i}`}>
              {renderNode(child, `paragraph-child-${index}-${i}`)}
            </React.Fragment>
          ))}
        </ThemedText>
      )

    case 'bulletList':
      return (
        <View key={`bullet-list-${index}`} style={styles.bulletList}>
          {node.content?.map((child, i) =>
            renderNode(child, `bullet-${index}-${i}`)
          )}
        </View>
      )

    case 'listItem':
      return (
        <View key={`list-item-${index}`} style={styles.listItem}>
          <ThemedText size="md" style={styles.bullet}>
            •
          </ThemedText>
          <View style={styles.listItemContent}>
            {node.content?.map((child, i) => (
              <React.Fragment key={`list-item-content-${index}-${i}`}>
                {renderNode(child, `list-item-${index}-${i}`)}
              </React.Fragment>
            ))}
          </View>
        </View>
      )

    case 'image':
      if (!node.attrs?.src) return null
      return (
        <Image
          key={index}
          source={{ uri: node.attrs.src }}
          style={styles.image}
          resizeMode="contain"
        />
      )

    // TODO: flush out user mention
    case 'mention':
      return (
        <ThemedText
          size="md"
          color={color.primary}
          weight="semibold"
          key={`mention-${node.attrs?.id}-${index}`}
        >
          @{node.attrs?.label}
        </ThemedText>
      )
    case 'text':
      if (!node.text) return null

      if (node.marks) {
        const textProps: any = {
          size: 'md',
        }

        node.marks.forEach((mark) => {
          if (mark.type === 'link') {
            textProps.color = color.primary
            textProps.onPress = () =>
              mark.attrs?.href && Linking.openURL(mark.attrs.href)
            textProps.style = {
              ...textProps.style,
              textDecorationLine: 'underline',
            }
          }
          if (mark.type === 'bold') {
            textProps.style = {
              ...textProps.style,
              ...styles.bold,
            }
          }
        })

        return (
          <ThemedText {...textProps} key={index}>
            {node.text}
          </ThemedText>
        )
      }

      return (
        <ThemedText size="md" key={index}>
          {node.text}
        </ThemedText>
      )

    case 'linkPreview':
      if (!node.attrs) return null
      return (
        <Pressable
          key={index}
          onPress={() => node.attrs?.url && Linking.openURL(node.attrs.url)}
          style={{
            marginVertical: 16,
            borderRadius: Rounded.lg,
            overflow: 'hidden',
            backgroundColor: color.backgroundSecondary, // or use your theme color
          }}
        >
          {node.attrs.image && (
            <Image
              source={{ uri: node.attrs.image }}
              style={styles.previewImage}
              resizeMode="cover"
            />
          )}
          <View style={{ padding: 16 }}>
            <ThemedText size="md" weight="bold" numberOfLines={1}>
              {node.attrs.title}
            </ThemedText>
            <ThemedText size="sm" color={color.textSecondary} numberOfLines={2}>
              {node.attrs.description}
            </ThemedText>
          </View>
        </Pressable>
      )

    case 'iframe':
      if (!node.attrs?.src) return null
      return (
        <ThemedText
          key={index}
          size="md"
          color={color.primary}
          style={{ textDecorationLine: 'underline' }}
          onPress={() => node.attrs?.src && Linking.openURL(node.attrs.src)}
        >
          {node.attrs.src}
        </ThemedText>
      )

    case 'heading': {
      const level = node.attrs?.level || 1
      return (
        <ThemedText
          size={level > 1 ? 'xl' : 'lg'}
          weight="bold"
          color={color.primary}
          style={{ marginTop: 16, marginBottom: 8 }}
          key={index}
        >
          {node.content?.map((child, i) =>
            renderNode(child, `heading-${index}-${i}`)
          )}
        </ThemedText>
      )
    }

    default:
      return null
  }
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: 200,
    marginVertical: 8,
  },
  bulletList: {
    marginVertical: 8,
  },
  listItem: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingLeft: 8,
    alignItems: 'flex-start',
  },
  bullet: {
    marginRight: 8,
  },
  listItemContent: {
    flex: 1,
  },
  bold: {
    fontWeight: 'bold',
  },
  previewImage: {
    width: '100%',
    height: 200,
  },
  blockquote: {
    borderLeftWidth: 2,
    borderLeftColor: '#ccc',
    paddingLeft: 12,
    marginVertical: 8,
  },
  code: {
    backgroundColor: '#f5f5f5',
    padding: 4,
    borderRadius: Rounded.sm,
  },
})
