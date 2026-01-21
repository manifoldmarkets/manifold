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
  label: string
  field: string
  value: string
  setValue: (value: string) => void
  placeholder?: string
}) {
  const { label, field, value, setValue, placeholder } = props

  return (
    <Col className="gap-2">
      <label className="text-ink-600 text-sm font-medium">{label}</label>
      {field === 'bio' ? (
        <ExpandingInput
          className="min-h-[80px] w-full !py-3 text-sm"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <Input
          type="text"
          className={'w-full sm:w-96'}
          value={value}
          onChange={(e) => setValue(e.target.value || '')}
          placeholder={placeholder}
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
      } catch (e: any) {
        // Show the specific error message from the API if available
        const errorMessage = e?.message || 'Failed to update profile'
        toast.error(errorMessage)
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
    <Col className="gap-5">
      {/* Avatar Section */}
      <Col className="gap-2">
        <label className="text-ink-600 text-sm font-medium">
          Profile Picture
        </label>
        <Row className="items-center gap-4">
          {avatarLoading ? (
            <div className="flex h-20 w-20 items-center justify-center">
              <LoadingIndicator />
            </div>
          ) : (
            <>
              <img
                alt={`${user.username}'s avatar`}
                src={avatarUrl}
                width={80}
                height={80}
                className="bg-ink-400 h-20 w-20 rounded-full object-cover ring-2 ring-white/20"
              />
              <Col className="items-start gap-2">
                <label className="bg-primary-100 text-primary-700 hover:bg-primary-200 cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors">
                  Choose File
                  <input
                    type="file"
                    name="file"
                    onChange={fileHandler}
                    accept="image/*"
                    className="hidden"
                  />
                </label>
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
      </Col>

      {/* Display Name */}
      <Col className="gap-2">
        <label className="text-ink-600 text-sm font-medium">Display name</label>
        <Input
          disabled={loadingName}
          type="text"
          placeholder="Display name"
          value={name}
          onChange={(e) => updateUserState({ name: e.target.value || '' })}
          className="w-full sm:w-96"
        />
        {loadingName && (
          <Row className="items-center gap-2 text-sm">
            <LoadingIndicator size="sm" />
            <span className="text-ink-500">Updating...</span>
          </Row>
        )}
        {errorName && (
          <span className="text-scarlet-500 text-sm">{errorName}</span>
        )}
      </Col>

      {/* Username */}
      <Col className="gap-2">
        <label className="text-ink-600 text-sm font-medium">Username</label>
        <Input
          disabled={loadingUsername}
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => updateUserState({ username: e.target.value || '' })}
          className="w-full sm:w-96"
        />
        {loadingUsername && (
          <Row className="items-center gap-2 text-sm">
            <LoadingIndicator size="sm" />
            <span className="text-ink-500">Updating...</span>
          </Row>
        )}
        {errorUsername && (
          <span className="text-scarlet-500 text-sm">{errorUsername}</span>
        )}
      </Col>

      <EditUserField
        label="Bio"
        field="bio"
        value={bio}
        setValue={setBio}
        placeholder="Tell us about yourself..."
      />
      <EditUserField
        label="Website URL"
        field="website"
        value={website}
        setValue={setWebsite}
        placeholder="https://example.com"
      />
      <EditUserField
        label="Twitter"
        field="twitterHandle"
        value={twitterHandle}
        setValue={setTwitterHandle}
        placeholder="username"
      />
      <EditUserField
        label="Discord"
        field="discordHandle"
        value={discordHandle}
        setValue={setDiscordHandle}
        placeholder="username#0000"
      />

      {/* Email (read-only) */}
      <Col className="gap-2">
        <label className="text-ink-600 text-sm font-medium">Email</label>
        <div className="text-ink-500 text-sm">{privateUser.email ?? '—'}</div>
      </Col>

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={loading || Object.keys(updates).length === 0}
        className="mt-2 self-start"
        size="lg"
      >
        {loading ? <LoadingIndicator /> : 'Save Changes'}
      </Button>
    </Col>
  )
}
