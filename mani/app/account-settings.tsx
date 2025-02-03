import { useState } from 'react'
import { Alert } from 'react-native'
import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { ThemedText } from 'components/themed-text'
import { Button } from 'components/buttons/button'
import { useColor } from 'hooks/use-color'
import { usePrivateUser, useUser } from 'hooks/use-user'
import { api } from 'lib/api'
import { Input } from 'components/widgets/input'
import Page from 'components/page'
import { Switch } from 'components/form/switch'
import { IconSymbol } from 'components/ui/icon-symbol'
import { capitalize } from 'lodash'
import { TRADE_TERM } from 'common/envs/constants'
import { auth } from 'lib/firebase/init'
import Clipboard from 'expo-clipboard'
import { useToast } from 'react-native-toast-notifications'

function SettingRow(props: { label: string; children: React.ReactNode }) {
  const { label, children } = props
  return (
    <Col style={{ gap: 8 }}>
      <ThemedText size="sm" weight="medium">
        {label}
      </ThemedText>
      {children}
    </Col>
  )
}

export default function AccountSettingsPage() {
  const user = useUser()
  const privateUser = usePrivateUser()
  const color = useColor()
  const [apiKey, setApiKey] = useState(privateUser?.apiKey)
  const [betWarnings, setBetWarnings] = useState(!user?.optOutBetWarnings)
  const [loading, setLoading] = useState(false)

  const updateApiKey = async () => {
    setLoading(true)
    const newApiKey = await generateNewApiKey()
    setApiKey(newApiKey ?? '')
    setLoading(false)
  }
  const toast = useToast()

  const copyApiKey = async () => {
    if (!apiKey) return
    await Clipboard.setStringAsync(apiKey)
    toast.show('API key copied to clipboard')
  }

  const confirmApiKeyUpdate = () => {
    Alert.alert(
      'Update API Key',
      'Updating your API key will break any existing applications connected to your account. Are you sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Update',
          onPress: updateApiKey,
        },
      ]
    )
  }
  if (!user) return null

  const deleteAccount = async () => {
    await api('me/delete', { username: user.username })
    await auth.signOut()
  }

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          onPress: deleteAccount,
          style: 'destructive',
        },
      ]
    )
  }

  return (
    <Page>
      <Col style={{ gap: 24, padding: 16 }}>
        <SettingRow label={`${capitalize(TRADE_TERM)} warnings`}>
          <Switch
            value={betWarnings}
            onValueChange={(enabled) => {
              setBetWarnings(enabled)
              api('me/update', { optOutBetWarnings: !enabled })
            }}
          />
        </SettingRow>

        <SettingRow label="API key">
          <Row style={{ gap: 8 }}>
            <Input
              value={apiKey}
              placeholder="Click refresh to generate key"
              editable={false}
              style={{ flex: 1 }}
            />
            <Button
              onPress={copyApiKey}
              variant="gray"
              disabled
              size="sm"
              style={{ justifyContent: 'center' }}
            >
              <IconSymbol name="doc.on.doc" size={20} color={color.text} />
            </Button>
            <Button
              onPress={confirmApiKeyUpdate}
              variant="gray"
              size="sm"
              loading={loading}
              style={{ justifyContent: 'center' }}
            >
              <IconSymbol
                name="arrow.triangle.2.circlepath"
                size={20}
                color={color.text}
              />
            </Button>
          </Row>
        </SettingRow>

        <SettingRow label="Delete Account">
          <Button
            onPress={confirmDeleteAccount}
            title="Delete Account"
            variant="gray"
          />
        </SettingRow>
      </Col>
    </Page>
  )
}

const generateNewApiKey = async () => {
  const newApiKey = crypto.randomUUID()

  try {
    await api('me/private/update', { apiKey: newApiKey })
  } catch (e) {
    console.error(e)
    return undefined
  }
  return newApiKey
}
