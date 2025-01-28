import { useState } from 'react'
import { View, Image, TouchableOpacity } from 'react-native'
import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { ThemedText } from 'components/themed-text'
import { Button } from 'components/buttons/button'
import { useColor } from 'hooks/use-color'
import { usePrivateUser, useUser } from 'hooks/use-user'
import { api } from 'lib/api'
import * as ImagePicker from 'expo-image-picker'
import { Input } from 'components/widgets/input'
import { Rounded } from 'constants/border-radius'
import Page from 'components/page'
import { useEditableUserInfo } from 'hooks/use-editable-user-info'
import { uploadPublicImage } from 'lib/firebase/storage'
import { nanoid } from 'common/util/random'
import { APIError } from 'common/api/utils'

function EditUserField(props: {
  label: string
  field: string
  value: string
  setValue: (value: string) => void
  multiline?: boolean
}) {
  const { label, value, setValue, multiline } = props

  return (
    <Col style={{ gap: 4 }}>
      <ThemedText size="sm" weight="medium">
        {label}
      </ThemedText>
      <Input
        value={value}
        onChangeText={setValue}
        multiline={multiline}
        style={{
          minHeight: multiline ? 100 : undefined,
          textAlignVertical: multiline ? 'top' : undefined,
        }}
      />
    </Col>
  )
}

export default function EditProfilePage() {
  const user = useUser()
  const color = useColor()
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '')
  const [loading, setLoading] = useState(false)

  const { userInfo, updateDisplayName, updateUsername, updateUserState } =
    useEditableUserInfo(user)
  const privateUser = usePrivateUser()
  const {
    name,
    username,
    errorUsername,
    loadingUsername,
    loadingName,
    errorName,
  } = userInfo

  const [bio, setBio] = useState(user?.bio || '')
  const [website, setWebsite] = useState(user?.website || '')
  const [twitterHandle, setTwitterHandle] = useState(user?.twitterHandle || '')
  const [discordHandle, setDiscordHandle] = useState(user?.discordHandle || '')
  const [finishedUpdating, setFinishedUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updates: { [key: string]: string } = {}

  if (bio.trim() !== (user?.bio || '').trim()) updates.bio = bio.trim()
  if (website.trim() !== (user?.website || '').trim())
    updates.website = website.trim()
  if (twitterHandle.trim() !== (user?.twitterHandle || '').trim())
    updates.twitterHandle = twitterHandle.trim()
  if (discordHandle.trim() !== (user?.discordHandle || '').trim())
    updates.discordHandle = discordHandle.trim()
  const nameUpdate = name.trim() !== (user?.name || '').trim()
  const usernameUpdate = username.trim() !== (user?.username || '').trim()
  const hasUpdates =
    Object.keys(updates).length > 0 || nameUpdate || usernameUpdate

  const handleSave = async () => {
    if (!hasUpdates) return

    // Handle name and username updates separately
    if (nameUpdate) {
      await updateDisplayName()
    }
    if (usernameUpdate) {
      await updateUsername()
    }

    setFinishedUpdating(false)
    setLoading(true)
    try {
      await api('me/update', updates)
      setFinishedUpdating(true)
    } catch (e) {
      if (e instanceof APIError) {
        setError(e.message)
      } else {
        setError('An error occurred')
      }
    }
    setLoading(false)
  }

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    })

    if (!result.canceled && result.assets[0].uri && user) {
      setLoading(true)
      try {
        const uri = result.assets[0].uri
        const ext = uri.split('.').pop() || 'jpg'
        const fileName = `avatar-${nanoid(10)}.${ext}`
        const url = await uploadPublicImage(user.username, uri, fileName)
        await api('me/update', { avatarUrl: url })
        setAvatarUrl(url)
      } catch (error) {
        console.error('Error uploading image:', error)
      }
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <Page>
      <Col style={{ gap: 16, padding: 16 }}>
        <Row style={{ alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={pickImage}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: Rounded.full,
                backgroundColor: avatarUrl ? 'transparent' : color.blue,
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden',
              }}
            >
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={{ width: 80, height: 80 }}
                />
              ) : (
                <ThemedText size="sm">Add Photo</ThemedText>
              )}
            </View>
          </TouchableOpacity>
        </Row>

        <Col style={{ gap: 8 }}>
          <ThemedText size="sm" weight="medium">
            Display name
          </ThemedText>
          <Input
            value={name}
            onChangeText={(text: string) => updateUserState({ name: text })}
            placeholder="Display name"
            editable={!loadingName}
          />
          {errorName && (
            <ThemedText size="sm" color={color.error}>
              {errorName}
            </ThemedText>
          )}
        </Col>

        <Col style={{ gap: 8 }}>
          <ThemedText size="sm" weight="medium">
            Username
          </ThemedText>
          <Input
            value={username}
            onChangeText={(text: string) => updateUserState({ username: text })}
            placeholder="Username"
            editable={!loadingUsername}
          />
          {errorUsername && (
            <ThemedText size="sm" color={color.error}>
              {errorUsername}
            </ThemedText>
          )}
        </Col>

        <EditUserField
          label="Bio"
          field="bio"
          value={bio}
          setValue={setBio}
          multiline
        />
        <EditUserField
          label="Website URL"
          field="website"
          value={website}
          setValue={setWebsite}
        />
        <EditUserField
          label="Twitter"
          field="twitterHandle"
          value={twitterHandle}
          setValue={setTwitterHandle}
        />
        <EditUserField
          label="Discord"
          field="discordHandle"
          value={discordHandle}
          setValue={setDiscordHandle}
        />

        <Col style={{ gap: 8 }}>
          <ThemedText size="sm" weight="medium">
            Email
          </ThemedText>
          <ThemedText color={color.textSecondary}>
            {privateUser?.email}
          </ThemedText>
        </Col>

        <Button
          onPress={handleSave}
          disabled={loading || loadingName || loadingUsername || !hasUpdates}
          loading={loading || loadingName || loadingUsername}
          title="Save"
        />
        {error && (
          <ThemedText size="sm" color={color.error}>
            {error}
          </ThemedText>
        )}
        {finishedUpdating && (
          <ThemedText size="sm" color={color.primary}>
            Profile updated!
          </ThemedText>
        )}
      </Col>
    </Page>
  )
}
