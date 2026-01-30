import { api, banUser } from 'web/lib/api/api'

async function superBanUser(userId: string) {
  let marketsStatus = "could not be unlisted nor N/A'd due to an unknown error"
  let commentsStatus = 'could not be hidden due to an unknown error'
  let banStatus = 'could not be applied due to an unknown error'
  const posts = await api('get-posts', { userId })
  const comments = await api('comments', { userId })

  // Apply all ban types permanently (no unbanTime = permanent)
  try {
    await banUser({
      userId,
      bans: {
        posting: true,
        marketControl: true,
        trading: true,
        purchase: true,
      },
      reason: 'Superbanned by moderator',
    })
    banStatus = 'all ban types applied permanently'
  } catch (error) {
    console.error('Failed to apply bans:', error)
    banStatus = 'failed to apply'
  }

  try {
    await api('super-ban-user', { userId })
    marketsStatus = "successfully unlisted & NA'd"
  } catch (error) {
    console.error('Failed to unlist and cancel user contracts:', error)
    marketsStatus = 'not affected (>5)'
  }

  if (comments.length > 30) {
    commentsStatus = 'not hidden (>30)'
  } else {
    if (comments.length > 0) {
      commentsStatus = 'successfully deleted'
    } else {
      commentsStatus = 'were not found'
    }
  }

  return `Super ban completed. Bans: ${banStatus}. Markets ${marketsStatus}. Comments ${commentsStatus}. Posts hidden: ${posts.length}.`
}

export { superBanUser }
