import { User } from 'common/user'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import { useState } from 'react'
import { TouchableOpacity } from 'react-native'
import { Modal } from 'components/layout/modal'
import { Col } from 'components/layout/col'
import { Button } from 'components/buttons/button'

export function StreakWidget({ user }: { user: User }) {
  const color = useColor()
  const [open, setOpen] = useState(false)
  return (
    <>
      <TouchableOpacity
        style={{
          alignItems: 'center',
          gap: 2,
          flexDirection: 'row',
        }}
        onPress={() => setOpen(true)}
      >
        <ThemedText size="md">🔥</ThemedText>
        <ThemedText
          color={color.textSecondary}
          family={'JetBrainsMono'}
          size="md"
        >
          {user.currentBettingStreak}
        </ThemedText>
      </TouchableOpacity>

      <Modal isOpen={open} onClose={() => setOpen(false)}>
        <Col
          style={{
            flex: 1,
            justifyContent: 'space-between',
          }}
        >
          <Col
            style={{
              flex: 1,
              gap: 18,
              alignItems: 'center',
              justifyContent: 'center',
              paddingBottom: '30%',
              width: '100%',
            }}
          >
            <ThemedText size="5xl" weight="bold">
              🔥 {user.currentBettingStreak}
            </ThemedText>

            <ThemedText
              color={color.textSecondary}
              size="md"
              style={{ width: '100%', textAlign: 'center' }}
            >
              Your prediction streak! Make at least one prediction each day to
              keep it going.
            </ThemedText>
          </Col>
          <Button onPress={() => setOpen(false)} size="lg">
            Got it
          </Button>
        </Col>
      </Modal>
    </>
  )
}
