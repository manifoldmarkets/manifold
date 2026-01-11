import { useEffect, useState } from 'react'
import { canSendMana } from 'common/can-send-mana'
import { User, UserBan } from 'common/user'
import { api } from 'web/lib/api/api'

export const useCanSendMana = (user: User) => {
  const [canSend, setCanSend] = useState({
    canSend: false,
    message: '',
  })
  useEffect(() => {
    api('get-user-bans', { userId: user.id })
      .then((res) => canSendMana(user, res.bans as UserBan[]))
      .then(setCanSend)
      .catch(() => {
        // On error, allow sending (fail open)
        setCanSend({ canSend: true, message: '' })
      })
  }, [user])
  return canSend
}
