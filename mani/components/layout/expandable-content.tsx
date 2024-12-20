import { useColor } from 'hooks/use-color'
import { useState } from 'react'
import { Pressable } from 'react-native'
import { BottomModal } from './bottom-modal'
import { Rounded } from 'constants/border-radius'

export function ExpandableContent({
  previewContent,
  modalContent,
}: {
  previewContent: React.ReactNode
  modalContent: React.ReactNode
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

      <BottomModal open={open} setOpen={setOpen}>
        {modalContent}
      </BottomModal>
    </>
  )
}
