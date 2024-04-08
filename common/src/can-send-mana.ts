import { isVerified, User } from './user'
import { formatMoney } from 'common/util/format'
import { unauthedApi } from 'common/util/api'

export async function canSendMana(user: User) {
  if (user.userDeleted || user.isBannedFromPosting) return false
  const { investmentValue } = await unauthedApi('get-user-portfolio', {
    userId: user.id,
  })
  return isVerified(user) && (investmentValue ?? 0) + user.balance > 1000
}

export const SEND_MANA_REQ = `Your account must have a verified phone number or purchase, and a net worth greater than ${formatMoney(
  1000
)}.`
