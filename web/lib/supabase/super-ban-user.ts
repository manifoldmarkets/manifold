import { api, banUser } from 'web/lib/api/api'

async function superBanUser(userId: string) {
  let marketsStatus = "could not be unlisted nor N/A'd due to an unknown error"
  let commentsStatus = 'could not be hidden due to an unknown error'

  try {
    await banUser({ userId })
    await api('unlist-and-cancel-user-contracts', { userId })
    marketsStatus = "successfully unlisted & NA'd"
  } catch (error) {
    console.error('Failed to unlist and cancel user contracts:', error)
    marketsStatus = 'not affected (>5)'
  }

  const comments = await api('comments', { userId })

  if (comments.length > 30) {
    commentsStatus = 'not hidden (>30)'
  } else {
    if (comments.length > 0) {
      const commentsToHide = comments.filter((comment) => !comment.hidden)
      for (const comment of commentsToHide) {
        await api('hide-comment', {
          commentPath: `contracts/${comment.contractId}/comments/${comment.id}`,
        })
      }
      commentsStatus = 'successfully hidden'
    } else {
      commentsStatus = 'were not found'
    }
  }
  const posts = await api('get-posts', { userId })
  if (posts.length > 0) {
    for (const post of posts) {
      await api('update-post', {
        id: post.id,
        visibility: 'unlisted',
      })
    }
  }

  return `Super ban completed. Markets ${marketsStatus}. Comments ${commentsStatus}. Posts hidden: ${posts.length}.`
}

export { superBanUser }
