import { User } from './user'

export async function canSendMana(user: User) {
  if (user.userDeleted || user.isBannedFromPosting)
    return {
      canSend: false,
      message: 'Your account is banned or deleted.',
    }
  return {
    canSend: true,
    message: '',
  }
}
