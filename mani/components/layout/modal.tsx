import { useColor } from 'hooks/use-color'
import { ReactNode } from 'react'
import { SafeAreaView, TouchableOpacity, View } from 'react-native'
import { Row } from './row'
import { IconSymbol } from 'components/ui/icon-symbol'
import { ThemedText } from 'components/themed-text'
import { Col } from './col'
import RNModal from 'react-native-modal'

type ModalProps = {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  mode?: 'back' | 'close'
  title?: string
}

export function Modal({
  isOpen,
  onClose,
  children,
  mode = 'close',
  title,
}: ModalProps) {
  const color = useColor()
  return (
    <RNModal
      isVisible={isOpen}
      onBackdropPress={onClose}
      animationIn="slideInRight"
      animationOut="slideOutRight"
      backdropTransitionOutTiming={0}
      style={{ margin: 0 }}
    >
      <View style={{ flex: 1, backgroundColor: color.background }}>
        <SafeAreaView style={{ flex: 1 }}>
          <View
            style={{
              flex: 1,
              backgroundColor: color.background,
              paddingHorizontal: 20,
            }}
          >
            <Row
              style={{
                marginBottom: 16,
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              {mode === 'back' && (
                <TouchableOpacity onPress={onClose}>
                  <IconSymbol
                    name="arrow.left"
                    size={24}
                    color={color.textTertiary}
                  />
                </TouchableOpacity>
              )}
              {mode === 'close' && <View style={{ width: 24 }} />}

              {title && (
                <ThemedText
                  style={{
                    fontSize: 18,
                    fontWeight: '600',
                    flex: 1,
                    textAlign: 'center',
                  }}
                >
                  {title}
                </ThemedText>
              )}

              {mode === 'close' ? (
                <TouchableOpacity onPress={onClose}>
                  <IconSymbol
                    name="xmark"
                    size={24}
                    color={color.textTertiary}
                  />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 24 }} />
              )}
            </Row>
            <Col style={{ flex: 1 }}>{children}</Col>
          </View>
        </SafeAreaView>
      </View>
    </RNModal>
  )
}
