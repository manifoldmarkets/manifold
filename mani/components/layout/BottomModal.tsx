import {
  Modal,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Col } from 'components/layout/col'
import { useColor } from 'hooks/useColor'

export function BottomModal({
  open,
  setOpen,
  children,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  children: React.ReactNode
}) {
  const color = useColor()

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setOpen(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <Col
            style={{
              flex: 1,
              justifyContent: 'flex-end',
              backgroundColor: color.modalOverlay,
            }}
          >
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <Col
                style={{
                  backgroundColor: color.backgroundSecondary,
                  padding: 20,
                  paddingBottom: 32,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  width: '100%',
                  maxHeight: '70%',
                  minHeight: 400,
                }}
              >
                {children}
              </Col>
            </TouchableWithoutFeedback>
          </Col>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  )
}
