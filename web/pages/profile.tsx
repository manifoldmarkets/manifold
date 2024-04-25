import { PrivateUser, User } from 'common/user'
import Link from 'next/link'
import { ReactNode, useState } from 'react'
import { SEO } from 'web/components/SEO'
import { buttonClass } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { Input } from 'web/components/widgets/input'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Title } from 'web/components/widgets/title'
import { useEditableUserInfo } from 'web/hooks/use-editable-user-info'
import { useUser } from 'web/hooks/use-user'
import { updateUserApi } from 'web/lib/firebase/api'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { uploadImage } from 'web/lib/firebase/storage'
import { getUserAndPrivateUser, updateUser } from 'web/lib/firebase/users'

export const getServerSideProps = redirectIfLoggedOut('/', async (_, creds) => {
  return { props: { auth: await getUserAndPrivateUser(creds.uid) } }
})

export function EditUserField(props: {
  user: User
  field: 'bio' | 'website' | 'twitterHandle' | 'discordHandle'
  label: ReactNode
}) {
  const { user, field, label } = props
  const [value, setValue] = useState(user[field] ?? '')

  async function updateField() {
    // Note: We trim whitespace before uploading to Firestore
    await updateUser(user.id, { [field]: value.trim() })
  }

  return (
    <Col>
      {label}
      {field === 'bio' ? (
        <ExpandingInput
          className="w-full"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={updateField}
        />
      ) : (
        <Input
          type="text"
          className={'w-full sm:w-96'}
          value={value}
          onChange={(e) => setValue(e.target.value || '')}
          onBlur={updateField}
        />
      )}
    </Col>
  )
}

export default function ProfilePage(props: {
  auth: { user: User; privateUser: PrivateUser }
}) {
  const { privateUser } = props.auth
  const user = useUser() ?? props.auth.user
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '')
  const [avatarLoading, setAvatarLoading] = useState(false)

  const { updateUsername, updateDisplayName, userInfo, updateUserState } =
    useEditableUserInfo(user)
  const {
    name,
    username,
    errorUsername,
    loadingUsername,
    loadingName,
    errorName,
  } = userInfo

  const fileHandler = async (event: any) => {
    const file = event.target.files[0]

    setAvatarLoading(true)

    await uploadImage(user.username, file)
      .then(async (url) => {
        await updateUserApi({ avatarUrl: url })
        setAvatarUrl(url)
        setAvatarLoading(false)
      })
      .catch(() => {
        setAvatarLoading(false)
        setAvatarUrl(user.avatarUrl || '')
      })
  }

  return (
    <Page trackPageView={'user profile page'}>
      <SEO title="Profile" description="User profile settings" url="/profile" />

      <Col className="bg-canvas-0 max-w-lg rounded p-6 shadow-md sm:mx-auto">
        <Row className="items-start justify-between">
          <Title>Edit Profile</Title>
        </Row>
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
                  className="bg-ink-400 flex items-center justify-center rounded-full"
                />
                <input type="file" name="file" onChange={fileHandler} />
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
                onChange={(e) => {
                  updateUserState({ name: e.target.value || '' })
                }}
                onBlur={updateDisplayName}
              />
            </Row>
            {loadingName && (
              <Row className={'mt-2 items-center gap-4'}>
                <LoadingIndicator />
                <span>Loading... This may take a while.</span>
              </Row>
            )}
            {errorName && (
              <span className="text-error text-sm">{errorName}</span>
            )}
          </Col>

          <Col>
            <label className="mb-1 block">Username</label>
            <Row>
              <Input
                disabled={loadingUsername}
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => {
                  updateUserState({ username: e.target.value || '' })
                }}
                onBlur={updateUsername}
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
          {(
            [
              ['bio', 'Bio'],
              ['website', 'Website URL'],
              ['twitterHandle', 'Twitter'],
              ['discordHandle', 'Discord'],
            ] as const
          ).map(([field, label]) => (
            <EditUserField
              key={field}
              user={user}
              field={field}
              label={<label className="mb-1 block">{label}</label>}
            />
          ))}
          <div className={'mt-2'}>
            <label className="mb-1 block">Email</label>
            <div className="text-ink-500">{privateUser.email ?? '\u00a0'}</div>
          </div>

          <Link
            href={`/${user.username}`}
            className={buttonClass('lg', 'green')}
          >
            Done
          </Link>
        </Col>
      </Col>
    </Page>
  )
}
