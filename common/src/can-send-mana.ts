import { isUserBanned } from './ban-utils'
import { BANNED_TRADING_USER_IDS } from './envs/constants'
import { User, UserBan } from './user'

export async function canSendMana(user: User, bans: UserBan[]) {
  if (user.userDeleted) {
    return {
      canSend: false,
      message: 'Your account is deleted.',
    }
  }

  // Check granular trading ban (or legacy hardcoded list)
  if (isUserBanned(bans, 'trading') || BANNED_TRADING_USER_IDS.includes(user.id)) {
    return {
      canSend: false,
      message: 'You are banned from trading, which includes sending managrams.',
    }
  }

  // Check granular posting ban (or legacy isBannedFromPosting)
  if (isUserBanned(bans, 'posting') || user.isBannedFromPosting) {
    return {
      canSend: false,
      message: 'You are banned from posting, which includes sending managrams.',
    }
  }

  return {
    canSend: true,
    message: '',
  }
}
