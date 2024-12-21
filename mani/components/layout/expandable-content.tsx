import { useColor } from 'hooks/use-color'
import { useState } from 'react'
import { Pressable } from 'react-native'
import { Rounded } from 'constants/border-radius'
import { Modal } from 'components/layout/modal'

export function ExpandableContent({
  previewContent,
  modalContent,
  modalTitle,
}: {
  previewContent: React.ReactNode
  modalContent: React.ReactNode
  modalTitle?: string
}) {
  const [open, setOpen] = useState(false)
  const color = useColor()
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          backgroundColor: color.backgroundSecondary,
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: Rounded.sm,
          gap: 8,
        }}
      >
        {previewContent}
      </Pressable>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={modalTitle}>
        {modalContent}
      </Modal>
    </>
  )
}
