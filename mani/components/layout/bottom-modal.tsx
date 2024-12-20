import { Modal, ScrollView, Pressable } from 'react-native'
import { useColor } from 'hooks/use-color'

export function BottomModal({
  open,
  setOpen,
  children,
  scrollable = true,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  children: React.ReactNode
  scrollable?: boolean
}) {
  const color = useColor()

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setOpen(false)}
    >
      <Pressable
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: color.modalOverlay,
        }}
        onPress={() => setOpen(false)}
      >
        <Pressable
          onPress={(e) => {
            e.stopPropagation()
          }}
          style={{
            backgroundColor: color.backgroundSecondary,
            paddingVertical: 20,
            paddingHorizontal: scrollable ? 0 : 20,
            paddingBottom: 32,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            width: '100%',
            maxHeight: '70%',
          }}
        >
          {/* <View> */}
          {scrollable ? (
            <ScrollView
              showsVerticalScrollIndicator={true}
              bounces={false}
              scrollEnabled={true}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderTerminationRequest={() => false}
              style={{
                paddingHorizontal: 20,
              }}
            >
              <Pressable onPress={(e) => e.stopPropagation()}>
                {children}
              </Pressable>
            </ScrollView>
          ) : (
            children
          )}
          {/* </View> */}
        </Pressable>
      </Pressable>
    </Modal>
  )
}
