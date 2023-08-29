import { useEffect, useState } from 'react'
import { canSendMana, SEND_MANA_REQ } from 'common/manalink'
import { User } from 'common/user'
import { db } from 'web/lib/supabase/db'

export const useCanSendMana = (user: User) => {
  const [canSend, setCanSend] = useState(false)
  useEffect(() => {
    canSendMana(user, db).then(setCanSend)
  }, [user])
  return {
    canSend,
    message: SEND_MANA_REQ,
  }
}
