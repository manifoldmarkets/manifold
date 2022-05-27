import React, { useEffect, useState } from 'react'
import { RefreshIcon } from '@heroicons/react/outline'
import Router from 'next/router'

import { AddFundsButton } from 'web/components/add-funds-button'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { formatMoney } from 'common/util/format'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'
import { changeUserInfo } from 'web/lib/firebase/fn-call'
import { uploadImage } from 'web/lib/firebase/storage'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { User } from 'common/user'
import { updateUser, updatePrivateUser } from 'web/lib/firebase/users'
import { defaultBannerUrl } from 'web/components/user-page'
import { SiteLink } from 'web/components/site-link'
import Textarea from 'react-expanding-textarea'

function EditUserField(props: {
  user: User
  field: 'bio' | 'website' | 'bannerUrl' | 'twitterHandle' | 'discordHandle'
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
        <Textarea
          className="textarea textarea-bordered w-full resize-none"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={updateField}
        />
      ) : (
        <input
          type="text"
          className="input input-bordered"
          value={value}
          onChange={(e) => setValue(e.target.value || '')}
          onBlur={updateField}
        />
      )}
    </div>
  )
}

export default function ProfilePage() {
  const user = useUser()
  const privateUser = usePrivateUser(user?.id)

  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '')
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [name, setName] = useState(user?.name || '')
  const [username, setUsername] = useState(user?.username || '')
  const [apiKey, setApiKey] = useState(privateUser?.apiKey || '')

  useEffect(() => {
    if (user) {
      setAvatarUrl(user.avatarUrl || '')
      setName(user.name || '')
      setUsername(user.username || '')
    }
  }, [user])

  useEffect(() => {
    if (privateUser) {
      setApiKey(privateUser.apiKey || '')
    }
  }, [privateUser])

  const updateDisplayName = async () => {
    const newName = cleanDisplayName(name)

    if (newName) {
      setName(newName)

      await changeUserInfo({ name: newName })
        .catch(() => ({ status: 'error' }))
        .then((r) => {
          if (r.status === 'error') setName(user?.name || '')
        })
    } else {
      setName(user?.name || '')
    }
  }

  const updateUsername = async () => {
    const newUsername = cleanUsername(username)

    if (newUsername) {
      setUsername(newUsername)
      await changeUserInfo({ username: newUsername })
        .catch(() => ({ status: 'error' }))
        .then((r) => {
          if (r.status === 'error') setUsername(user?.username || '')
        })
    } else {
      setUsername(user?.username || '')
    }
  }

  const updateApiKey = async (e: React.MouseEvent) => {
    const newApiKey = crypto.randomUUID()
    if (user?.id != null) {
      setApiKey(newApiKey)
      await updatePrivateUser(user.id, { apiKey: newApiKey }).catch(() => {
        setApiKey(privateUser?.apiKey || '')
      })
    }
    e.preventDefault()
  }

  const fileHandler = async (event: any) => {
    const file = event.target.files[0]

    setAvatarLoading(true)

    await uploadImage(user?.username || 'default', file)
      .then(async (url) => {
        await changeUserInfo({ avatarUrl: url })
        setAvatarUrl(url)
        setAvatarLoading(false)
      })
      .catch(() => {
        setAvatarLoading(false)
        setAvatarUrl(user?.avatarUrl || '')
      })
  }

  if (user === null) {
    Router.replace('/')
    return <></>
  }

  return (
    <Page>
      <SEO title="Profile" description="User profile settings" url="/profile" />

      <Col className="max-w-lg rounded bg-white p-6 shadow-md sm:mx-auto">
        <Row className="justify-between">
          <Title className="!mt-0" text="Edit Profile" />
          <SiteLink className="btn btn-primary" href={`/${user?.username}`}>
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
            <input
              type="text"
              placeholder="Display name"
              className="input input-bordered"
              value={name}
              onChange={(e) => setName(e.target.value || '')}
              onBlur={updateDisplayName}
            />
          </div>

          <div>
            <label className="label">Username</label>
            <input
              type="text"
              placeholder="Username"
              className="input input-bordered"
              value={username}
              onChange={(e) => setUsername(e.target.value || '')}
              onBlur={updateUsername}
            />
          </div>

          {user && (
            <>
              {/* TODO: Allow users with M$ 2000 of assets to set custom banners */}
              {/* <EditUserField
                user={user}
                field="bannerUrl"
                label="Banner Url"
                isEditing={isEditing}
              /> */}
              <label className="label">
                Banner image{' '}
                <span className="text-sm text-gray-400">
                  Not editable for now
                </span>
              </label>
              <div
                className="h-32 w-full bg-cover bg-center sm:h-40"
                style={{
                  backgroundImage: `url(${
                    user.bannerUrl || defaultBannerUrl(user.id)
                  })`,
                }}
              />

              {(
                [
                  ['bio', 'Bio'],
                  ['website', 'Website URL'],
                  ['twitterHandle', 'Twitter'],
                  ['discordHandle', 'Discord'],
                ] as const
              ).map(([field, label]) => (
                <EditUserField user={user} field={field} label={label} />
              ))}
            </>
          )}

          <div>
            <label className="label">Email</label>
            <div className="ml-1 text-gray-500">
              {privateUser?.email ?? '\u00a0'}
            </div>
          </div>

          <div>
            <label className="label">Balance</label>
            <Row className="ml-1 items-start gap-4 text-gray-500">
              {formatMoney(user?.balance || 0)}
              <AddFundsButton />
            </Row>
          </div>

          <div>
            <label className="label">API key</label>
            <div className="input-group w-full">
              <input
                type="text"
                placeholder="Click refresh to generate key"
                className="input input-bordered w-full"
                value={apiKey}
                readOnly
              />
              <button
                className="btn btn-primary btn-square p-2"
                onClick={updateApiKey}
              >
                <RefreshIcon />
              </button>
            </div>
          </div>
        </Col>
      </Col>
    </Page>
  )
}
