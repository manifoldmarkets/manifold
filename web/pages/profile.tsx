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

  const [selectedFile, setSelectedFile] = useState<undefined | Blob>()

  const changeHandler = (event: any) => {
    setSelectedFile(event.target.files[0])
    //   handleSubmission()
    // }

    // const handleSubmission = () => {
    //   if (!selectedFile) return
    const formData = new FormData()

    formData.append('File', event.target.files[0])

    fetch(
      'https://freeimage.host/api/1/upload?key=6d207e02198a847aa98d0a2a901485a5',
      {
        method: 'POST',
        body: formData,
      }
    )
      .then((response) => response.json())
      .then((result) => {
        console.log('Success:', result)
      })
      .catch((error) => {
        console.error('Error:', error)
      })
  }

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
        <input type="file" name="file" onChange={changeHandler} />
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
