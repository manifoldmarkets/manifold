import Image from 'next/image'
import { useEffect, useState } from 'react'
import { AddFundsButton } from '../components/add-funds-button'

import { Page } from '../components/page'
import { SEO } from '../components/SEO'
import { Title } from '../components/title'
import { usePrivateUser, useUser } from '../hooks/use-user'
import { formatMoney } from '../lib/util/format'

export default function ProfilePage() {
  const user = useUser()
  const privateUser = usePrivateUser(user?.id)

  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '')
  const [name, setName] = useState(user?.name || '')
  const [username, setUsername] = useState(user?.username || '')

  useEffect(() => {
    if (user) {
      setAvatarUrl(user.avatarUrl || '')
      setName(user.name || '')
      setUsername(user.username || '')
    }
  }, [user])

  return (
    <Page>
      <SEO title="Profile" description="User profile settings" url="/profile" />
      <Title text="Profile" />

      <p>
        <img
          src={avatarUrl}
          width={80}
          height={80}
          className="rounded-full bg-gray-400 flex items-center justify-center"
        />
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
