import { api } from 'web/lib/api/api'

async function superBanUser(userId: string) {
  let marketsStatus = "could not be unlisted nor N/A'd due to an unknown error"
  let commentsStatus = 'could not be hidden due to an unknown error'
  let banStatus = 'could not be applied due to an unknown error'
  const posts = await api('get-posts', { userId })
  const comments = await api('comments', { userId })

  try {
    const result = await api('super-ban-user', { userId })
    marketsStatus = result.skippedMarketCleanup
      ? 'not affected (>5)'
      : "successfully unlisted & NA'd"
    banStatus = 'all ban types applied permanently'
  } catch (error) {
    console.error('Failed to superban user:', error)
    marketsStatus = 'not affected (>5)'
    banStatus = 'failed to apply'
  }

  if (comments.length > 30) {
    commentsStatus = 'not hidden unless new user (>30)'
  } else if (comments.length > 0) {
    commentsStatus = 'successfully deleted'
  } else {
    commentsStatus = 'were not found'
  }

  return `Super ban completed. Bans: ${banStatus}. Markets ${marketsStatus}. Comments ${commentsStatus}. Posts hidden: ${posts.length}.`
}

export { superBanUser }
