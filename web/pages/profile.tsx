import { RefreshIcon } from '@heroicons/react/outline'
import { PrivateUser, User } from 'common/user'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'
import Link from 'next/link'
import React, { useState } from 'react'
import { ConfirmationButton } from 'web/components/confirmation-button'
import { ExpandingInput } from 'web/components/expanding-input'
import { Input } from 'web/components/input'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { SiteLink } from 'web/components/site-link'
import { Title } from 'web/components/title'
import { generateNewApiKey } from 'web/lib/api/api-key'
import { changeUserInfo } from 'web/lib/firebase/api'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { uploadImage } from 'web/lib/firebase/storage'
import {
  getUserAndPrivateUser,
  updatePrivateUser,
  updateUser,
} from 'web/lib/firebase/users'

export const getServerSideProps = redirectIfLoggedOut('/', async (_, creds) => {
  return { props: { auth: await getUserAndPrivateUser(creds.uid) } }
})

function EditUserField(props: {
  user: User
  field: 'bio' | 'website' | 'twitterHandle' | 'discordHandle'
  label: string
}) {
  const { user, field, label } = props
  const [value, setValue] = useState(user[field] ?? '')

  async function updateField() {
    // Note: We trim whitespace before uploading to Firestore
    await updateUser(user.id, { [field]: value.trim() })
  }

  return (
    <div>
      <label className="label">{label}</label>

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
          value={value}
          onChange={(e) => setValue(e.target.value || '')}
          onBlur={updateField}
        />
      )}
    </div>
  )
}

export default function ProfilePage(props: {
  auth: { user: User; privateUser: PrivateUser }
}) {
  const { user, privateUser } = props.auth
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '')
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [name, setName] = useState(user.name)
  const [username, setUsername] = useState(user.username)
  const [apiKey, setApiKey] = useState(privateUser.apiKey || '')

  const updateDisplayName = async () => {
    const newName = cleanDisplayName(name)
    if (newName) {
      setName(newName)
      await changeUserInfo({ name: newName }).catch((_) => setName(user.name))
    } else {
      setName(user.name)
    }
  }

  const updateUsername = async () => {
    const newUsername = cleanUsername(username)
    if (newUsername) {
      setUsername(newUsername)
      await changeUserInfo({ username: newUsername }).catch((_) =>
        setUsername(user.username)
      )
    } else {
      setUsername(user.username)
    }
  }

  const updateApiKey = async (e?: React.MouseEvent) => {
    const newApiKey = await generateNewApiKey(user.id)
    setApiKey(newApiKey ?? '')
    e?.preventDefault()

    if (!privateUser.twitchInfo) return
    await updatePrivateUser(privateUser.id, {
      twitchInfo: { ...privateUser.twitchInfo, needsRelinking: true },
    })
  }

  const fileHandler = async (event: any) => {
    const file = event.target.files[0]

    setAvatarLoading(true)

    await uploadImage(user.username, file)
      .then(async (url) => {
        await changeUserInfo({ avatarUrl: url })
        setAvatarUrl(url)
        setAvatarLoading(false)
      })
      .catch(() => {
        setAvatarLoading(false)
        setAvatarUrl(user.avatarUrl || '')
      })
  }

  return (
    <Page>
      <SEO title="Profile" description="User profile settings" url="/profile" />

      <Col className="max-w-lg rounded bg-white p-6 shadow-md sm:mx-auto">
        <Row className="justify-between">
          <Title className="!mt-0" text="Edit Profile" />
          <SiteLink className="btn btn-primary" href={`/${user.username}`}>
            Done
          </SiteLink>
        </Row>
        <Col className="gap-4">
          <Row className="items-center gap-4">
            {avatarLoading ? (
              <button className="btn btn-ghost btn-lg btn-circle loading"></button>
            ) : (
              <>
                <img
                  src={avatarUrl}
                  width={80}
                  height={80}
                  className="flex items-center justify-center rounded-full bg-gray-400"
                />
                <input type="file" name="file" onChange={fileHandler} />
              </>
            )}
          </Row>

          <div>
            <label className="label">Display name</label>
            <Input
              type="text"
              placeholder="Display name"
              value={name}
              onChange={(e) => setName(e.target.value || '')}
              onBlur={updateDisplayName}
            />
          </div>

          <div>
            <label className="label">Username</label>
            <Input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value || '')}
              onBlur={updateUsername}
            />
          </div>
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
              label={label}
            />
          ))}

          <div>
            <label className="label">Email</label>
            <div className="ml-1 text-gray-500">
              {privateUser.email ?? '\u00a0'}
            </div>
          </div>

          <div>
            <label className="label">API key</label>
            <div className="input-group w-full">
              <Input
                type="text"
                placeholder="Click refresh to generate key"
                value={apiKey}
                readOnly
              />
              <ConfirmationButton
                openModalBtn={{
                  className: 'p-2',
                  label: '',
                  icon: <RefreshIcon className="h-5 w-5" />,
                  color: 'indigo',
                }}
                submitBtn={{
                  label: 'Update key',
                }}
                onSubmitWithSuccess={async () => {
                  updateApiKey()
                  return true
                }}
              >
                <Col>
                  <Title text={'Are you sure?'} />
                  <div>
                    Updating your API key will break any existing applications
                    connected to your account, <b>including the Twitch bot</b>.
                    You will need to go to the{' '}
                    <Link href="/twitch">
                      <a className="underline focus:outline-none">
                        Twitch page
                      </a>
                    </Link>{' '}
                    to relink your account.
                  </div>
                </Col>
              </ConfirmationButton>
            </div>
          </div>
        </Col>
      </Col>
    </Page>
  )
}
