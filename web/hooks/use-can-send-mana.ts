import { useEffect, useState } from 'react'
import { canSendMana } from 'common/can-send-mana'
import { User } from 'common/user'

export const useCanSendMana = (user: User) => {
  const [canSend, setCanSend] = useState({
    canSend: false,
    message: '',
  })
  useEffect(() => {
    canSendMana(user).then(setCanSend)
  }, [user])
  return canSend
}
