import { View } from 'react-native'
import { Modal } from 'components/layout/modal'
import { Col } from 'components/layout/col'
import { Button } from 'components/buttons/button'
import { useColor } from 'hooks/use-color'
import { auth } from 'lib/firebase/init'
import { clearData } from 'lib/auth-storage'
import { router } from 'expo-router'

export function SettingsModal(props: { isOpen: boolean; onClose: () => void }) {
  const { isOpen, onClose } = props
  const color = useColor()

  const signOut = async () => {
    try {
      await auth.signOut()
      await clearData('user')
      onClose()
    } catch (err) {
      console.error('Error signing out:', err)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings">
      <Col style={{ gap: 16, padding: 16 }}>
        <View>
          <Button
            onPress={() => {
              router.push('/edit-profile')
              onClose()
            }}
            title="Edit Profile"
            variant="gray"
          />
        </View>
        <View>
          <Button
            onPress={() => {
              router.push('/account-settings')
              onClose()
            }}
            title="Account Settings"
            variant="gray"
          />
        </View>
        <View>
          <Button onPress={signOut} title="Sign Out" variant="gray" />
        </View>
      </Col>
    </Modal>
  )
}
