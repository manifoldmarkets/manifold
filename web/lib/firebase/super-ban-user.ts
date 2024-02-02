import { api, banUser } from 'web/lib/firebase/api'

async function superBanUser(userId: string) {
  try {
    await banUser({ userId })
    await api('unlist-and-cancel-user-contracts', { userId })
  } catch (error) {
    console.error('Failed to unlist and cancel user contracts:', error)
    // Optionally, alert or handle the error specifically if needed
    // alert('Failed to unlist and cancel all user contracts. Proceeding with comment hiding.');
  }

  const comments = await api('comments', { userId })

  if (comments.length > 15) {
    throw new Error('User has more than 15 comments. Manual review required.')
  }

  for (const comment of comments) {
    await api('hide-comment', {
      commentPath: `contracts/${comment.contractId}/comments/${comment.id}`,
    })
  }

  alert('Superban completed')
  try {
  } catch (error) {
    console.error('Superban failed:', error)
    alert(error instanceof Error ? error.message : 'An unknown error occurred')
  }
}

export { superBanUser }
