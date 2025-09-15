import { BANNED_TRADING_USER_IDS } from './envs/constants'
import { User } from './user'

export async function canSendMana(user: User) {
  if (
    user.userDeleted ||
    user.isBannedFromPosting ||
    BANNED_TRADING_USER_IDS.includes(user.id)
  )
    return {
      canSend: false,
      message: 'Your account is banned or deleted.',
    }
  return {
    canSend: true,
    message: '',
  }
}
