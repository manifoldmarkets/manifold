import { api, banUser } from 'web/lib/api/api'

async function superBanUser(userId: string) {
  let marketsStatus = "could not be unlisted nor N/A'd due to an unknown error"
  let commentsStatus = 'could not be hidden due to an unknown error'
  const posts = await api('get-posts', { userId })
  const comments = await api('comments', { userId })

  try {
    await banUser({ userId })
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

  return `Super ban completed. Markets ${marketsStatus}. Comments ${commentsStatus}. Posts hidden: ${posts.length}.`
}

export { superBanUser }
