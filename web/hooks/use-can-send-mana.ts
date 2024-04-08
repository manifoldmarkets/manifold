import { useEffect, useState } from 'react'
import { canSendMana, SEND_MANA_REQ } from 'common/can-send-mana'
import { User } from 'common/user'

export const useCanSendMana = (user: User) => {
  const [canSend, setCanSend] = useState(false)
  useEffect(() => {
    canSendMana(user).then(setCanSend)
  }, [user])
  return {
    canSend,
    message: SEND_MANA_REQ,
  }
}
