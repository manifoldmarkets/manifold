import { useEffect, useState } from 'react'
import { AddFundsButton } from '../components/add-funds-button'

import { Page } from '../components/page'
import { SEO } from '../components/SEO'
import { Title } from '../components/title'
import { usePrivateUser, useUser } from '../hooks/use-user'
import { formatMoney } from '../../common/util/format'
import {
  cleanDisplayName,
  cleanUsername,
} from '../../common/util/clean-username'
import { changeUserInfo } from '../lib/firebase/api-call'
import { uploadImage } from '../lib/firebase/storage'

export default function ProfilePage() {
  const user = useUser()
  const privateUser = usePrivateUser(user?.id)

  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '')
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [name, setName] = useState(user?.name || '')
  const [username, setUsername] = useState(user?.username || '')

  useEffect(() => {
    if (user) {
      setAvatarUrl(user.avatarUrl || '')
      setName(user.name || '')
      setUsername(user.username || '')
    }
  }, [user])

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

  return (
    <Page>
      <SEO title="Profile" description="User profile settings" url="/profile" />
      <Title text="Profile" />

      <p>
        {avatarLoading ? (
          <button className="btn btn-ghost btn-lg btn-circle loading"></button>
        ) : (
          <>
            <img
              src={avatarUrl}
              width={80}
              height={80}
              className="rounded-full bg-gray-400 flex items-center justify-center"
            />
            <input type="file" name="file" onChange={fileHandler} />
          </>
        )}
      </p>

      <label className="label">
        <span className="label-text">Display name</span>
      </label>

      <input
        type="text"
        placeholder="Display name"
        className="input input-bordered"
        value={name}
        onChange={(e) => setName(e.target.value || '')}
        onBlur={updateDisplayName}
      />

      <label className="label">
        <span className="label-text">Username</span>
      </label>

      <input
        type="text"
        placeholder="Username"
        className="input input-bordered"
        value={username}
        onChange={(e) => setUsername(e.target.value || '')}
        onBlur={updateUsername}
      />

      <label className="label">
        <span className="label-text">Email</span>
      </label>
      <p>{privateUser?.email}</p>

      <label className="label">
        <span className="label-text">Balance</span>
      </label>
      <p>{formatMoney(user?.balance || 0)}</p>
      <AddFundsButton />
    </Page>
  )
}
