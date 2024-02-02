import { api, banUser } from 'web/lib/firebase/api'

async function superBanUser(userId: string) {
  try {
    await banUser({ userId })
    await api('unlist-and-cancel-user-contracts', { userId })
    alert('Superban completed')
  } catch (error) {
    console.error('Superban failed:', error)
    alert(error instanceof Error ? error.message : 'An unknown error occurred')
  }
}

export { superBanUser }
