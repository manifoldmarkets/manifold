import { useColor } from 'hooks/use-color'
import { ReactNode, useEffect } from 'react'
import {
  SafeAreaView,
  TouchableOpacity,
  View,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native'
import { Row } from './row'
import { IconSymbol } from 'components/ui/icon-symbol'
import { ThemedText } from 'components/themed-text'
import { Col } from './col'
import { TokenToggleHeader } from './token-toggle-header'
import { Spacer } from './spacer'
import { useNavigation } from 'expo-router'
import { RootSiblingPortal } from 'react-native-root-siblings'
import { Colors } from 'constants/colors'

type ModalProps = {
  isOpen: boolean
  onClose?: () => void
  onBack?: () => void
  children: ReactNode
  title?: string
  showHeader?: boolean
}

export function Modal({
  isOpen,
  onClose,
  onBack,
  children,
  title,
  showHeader = false,
}: ModalProps) {
  const color = useColor()
  const navigation = useNavigation()
  const slideAnim = new Animated.Value(
    isOpen ? 0 : Dimensions.get('window').height
  )

  useEffect(() => {
    if (isOpen) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
      }).start()

      const unsubscribe = navigation.addListener('state', () => {
        if (onClose) onClose()
        else if (onBack) onBack()
      })
      return unsubscribe
    } else {
      Animated.spring(slideAnim, {
        toValue: Dimensions.get('window').height,
        useNativeDriver: true,
      }).start()
    }
  }, [isOpen, navigation, onClose, onBack, slideAnim])

  if (!isOpen) return null

  const modalContent = (
    <View style={styles.container}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.modalContent,
          {
            backgroundColor: color.background,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <SafeAreaView style={{ flex: 1 }}>
          {showHeader && (
            <Col>
              <TokenToggleHeader />
              <Spacer h={4} />
            </Col>
          )}
          <View style={styles.innerContent}>
            <Row style={styles.header}>
              {onBack ? (
                <TouchableOpacity onPress={onBack}>
                  <IconSymbol
                    name="arrow.left"
                    size={24}
                    color={color.textTertiary}
                  />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 24 }} />
              )}

              {title && <ThemedText style={styles.title}>{title}</ThemedText>}

              {onClose ? (
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
      </Animated.View>
    </View>
  )

  return <RootSiblingPortal>{modalContent}</RootSiblingPortal>
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
  },
  modalContent: {
    ...StyleSheet.absoluteFillObject,
  },
  innerContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 16,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
})
