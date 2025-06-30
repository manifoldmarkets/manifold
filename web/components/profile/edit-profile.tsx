import { PrivateUser, User } from 'common/user'

import { ReactNode, useCallback, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { Input } from 'web/components/widgets/input'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useEditableUserInfo } from 'web/hooks/use-editable-user-info'
import { useUser } from 'web/hooks/use-user'
import { api, updateUser } from 'web/lib/api/api'
import { uploadPublicImage } from 'web/lib/firebase/storage'
import { RefreshIcon } from '@heroicons/react/solid'

export function EditUserField(props: {
  label: ReactNode
  field: string
  value: string
  setValue: (value: string) => void
}) {
  const { label, field, value, setValue } = props

  return (
    <Col>
      {label}
      {field === 'bio' ? (
        <ExpandingInput
          className="w-full"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      ) : (
        <Input
          type="text"
          className={'w-full sm:w-96'}
          value={value}
          onChange={(e) => setValue(e.target.value || '')}
        />
      )}
    </Col>
  )
}

export const EditProfile = (props: {
  auth: { user: User; privateUser: PrivateUser }
}) => {
  const { privateUser } = props.auth
  const user = useUser() ?? props.auth.user
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '')
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [loading, setLoading] = useState(false)

  const { userInfo, updateUserState } = useEditableUserInfo(user)
  const {
    name,
    username,
    errorUsername,
    loadingUsername,
    loadingName,
    errorName,
  } = userInfo

  const [bio, setBio] = useState(user.bio || '')
  const [website, setWebsite] = useState(user.website || '')
  const [twitterHandle, setTwitterHandle] = useState(user.twitterHandle || '')
  const [discordHandle, setDiscordHandle] = useState(user.discordHandle || '')

  const getUpdates = useCallback(() => {
    const updates: { [key: string]: string } = {}

    if (bio.trim() !== (user.bio || '').trim()) updates.bio = bio.trim()
    if (website.trim() !== (user.website || '').trim())
      updates.website = website.trim()
    if (twitterHandle.trim() !== (user.twitterHandle || '').trim())
      updates.twitterHandle = twitterHandle.trim()
    if (discordHandle.trim() !== (user.discordHandle || '').trim())
      updates.discordHandle = discordHandle.trim()
    if (name.trim() !== (user.name || '').trim()) updates.name = name.trim()
    if (username.trim() !== (user.username || '').trim())
      updates.username = username.trim()
    return updates
  }, [bio, website, twitterHandle, discordHandle, name, username, user])
  const updates = getUpdates()

  const handleSave = async () => {
    if (Object.keys(updates).length > 0) {
      setLoading(true)
      try {
        await api('me/update', updates)
        toast.success('Profile updated successfully')
      } catch (e) {
        toast.error('Failed to update profile')
        console.error(e)
      } finally {
        setLoading(false)
      }
    } else {
      toast.error('No changes to save')
    }
  }

  const fileHandler = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Check if the file is an image
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.')
      return
    }

    // Prevent GIF uploads (potentially animated)
    if (file.type === 'image/gif' || file.name.toLowerCase().match(/\.gif$/)) {
      alert(
        'GIF files are not allowed for profile pictures as they may contain animations.'
      )
      return
    }

    setAvatarLoading(true)
    await toast.promise(
      uploadPublicImage(user.username, file).then(async (url) => {
        await updateUser({ avatarUrl: url })
        setAvatarUrl(url)
      }),
      {
        loading: 'Updating profile picture...',
        success: 'Profile picture updated successfully',
        error: 'Failed to update profile picture',
      }
    )
    setAvatarLoading(false)
  }

  const removeAvatar = async () => {
    setAvatarLoading(true)
    try {
      const updatedUser = await api('me/update', { avatarUrl: '' })
      setAvatarUrl(updatedUser.avatarUrl ?? '')
    } catch (e) {
      toast.error('Failed to randomly regenerate avatar.')
      console.error(e)
    } finally {
      setAvatarLoading(false)
    }
  }

  return (
    <Col className="gap-4">
      <Row className="items-center gap-4">
        {avatarLoading ? (
          <LoadingIndicator />
        ) : (
          <>
            <img
              alt={`${user.username}'s avatar`}
              src={avatarUrl}
              width={80}
              height={80}
              className="bg-ink-400 h-20 w-20 rounded-full"
            />
            <Col className="items-start gap-2">
              <input
                type="file"
                name="file"
                onChange={fileHandler}
                accept="image/*"
                className="min-w-0 flex-1"
              />
              {avatarUrl && (
                <Button
                  loading={avatarLoading}
                  disabled={avatarLoading}
                  color="gray-outline"
                  onClick={removeAvatar}
                  size="xs"
                >
                  <RefreshIcon className="mr-1 h-4 w-4" /> Random avatar
                </Button>
              )}
            </Col>
          </>
        )}
      </Row>

      <Col>
        <label className="mb-1 block">Display name</label>
        <Row className={'items-center gap-2'}>
          <Input
            disabled={loadingName}
            type="text"
            placeholder="Display name"
            value={name}
            onChange={(e) => updateUserState({ name: e.target.value || '' })}
          />
        </Row>
        {loadingName && (
          <Row className={'mt-2 items-center gap-4'}>
            <LoadingIndicator />
            <span>Loading... This may take a while.</span>
          </Row>
        )}
        {errorName && <span className="text-error text-sm">{errorName}</span>}
      </Col>

      <Col>
        <label className="mb-1 block">Username</label>
        <Row>
          <Input
            disabled={loadingUsername}
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) =>
              updateUserState({ username: e.target.value || '' })
            }
          />
        </Row>
        {loadingUsername && (
          <Row className={'mt-2 items-center gap-4'}>
            <LoadingIndicator />
            <span>Loading... This may take a while.</span>
          </Row>
        )}
        {errorUsername && (
          <span className="text-error text-sm">{errorUsername}</span>
        )}
      </Col>

      <EditUserField
        label={<label className="mb-1 block">Bio</label>}
        field="bio"
        value={bio}
        setValue={setBio}
      />
      <EditUserField
        label={<label className="mb-1 block">Website URL</label>}
        field="website"
        value={website}
        setValue={setWebsite}
      />
      <EditUserField
        label={<label className="mb-1 block">Twitter</label>}
        field="twitterHandle"
        value={twitterHandle}
        setValue={setTwitterHandle}
      />
      <EditUserField
        label={<label className="mb-1 block">Discord</label>}
        field="discordHandle"
        value={discordHandle}
        setValue={setDiscordHandle}
      />

      <div className={'mt-2'}>
        <label className="mb-1 block">Email</label>
        <div className="text-ink-500">{privateUser.email ?? '\u00a0'}</div>
      </div>

      <Button
        onClick={handleSave}
        disabled={loading || Object.keys(updates).length === 0}
      >
        {loading ? <LoadingIndicator /> : 'Save'}
      </Button>
    </Col>
  )
}
