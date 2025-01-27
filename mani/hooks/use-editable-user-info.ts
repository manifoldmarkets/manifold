import { useState } from 'react'
import { User } from 'common/user'
import { api } from 'lib/api'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'

type UserInfoState = {
  name: string
  username: string
  loadingName: boolean
  loadingUsername: boolean
  errorName: string
  errorUsername: string
}

export function useEditableUserInfo(user: User | null | undefined) {
  const [userInfo, setUserInfo] = useState<UserInfoState>({
    name: user?.name ?? '',
    username: user?.username ?? '',
    loadingName: false,
    loadingUsername: false,
    errorName: '',
    errorUsername: '',
  })

  const updateUserState = (newState: Partial<UserInfoState>) => {
    setUserInfo((prevState) => ({ ...prevState, ...newState }))
  }

  const updateDisplayName = async () => {
    if (!user) return
    const newName = cleanDisplayName(userInfo.name)
    if (newName === user.name) return

    updateUserState({ loadingName: true, errorName: '' })
    if (!newName) {
      updateUserState({ name: user.name })
      return
    }

    try {
      await api('me/update', { name: newName })
      updateUserState({ errorName: '', name: newName })
    } catch (error: any) {
      updateUserState({
        errorName: error.message || 'Error updating name',
        name: user.name,
      })
    }

    updateUserState({ loadingName: false })
  }

  const updateUsername = async () => {
    if (!user) return
    const newUsername = cleanUsername(userInfo.username)
    if (newUsername === user.username) return

    updateUserState({ loadingUsername: true, errorUsername: '' })

    try {
      await api('me/update', { username: newUsername })
      updateUserState({ errorUsername: '', username: newUsername })
    } catch (error: any) {
      updateUserState({
        errorUsername: error.message || 'Error updating username',
        username: user.username,
      })
    }

    updateUserState({ loadingUsername: false })
  }

  return {
    userInfo,
    updateDisplayName,
    updateUsername,
    updateUserState,
  }
}
