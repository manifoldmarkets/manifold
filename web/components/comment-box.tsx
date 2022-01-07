import { useState } from 'react'
import { createComment } from '../lib/firebase/comments'
import { User } from '../lib/firebase/users'

export function CommentBox(props: {
  className?: string
  contractId: string
  betId: string
  user: User | null | undefined
}) {
  const { className, contractId, betId, user } = props
  const [comment, setComment] = useState('')
  async function submitComment() {
    if (!user || !comment) return
    await createComment(contractId, betId, comment, user)
  }

  return (
    <div className="mt-2">
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="textarea textarea-bordered w-full"
        placeholder="Add a comment..."
      />
      <button className="btn btn-outline btn-sm mt-1" onClick={submitComment}>
        Comment
      </button>
    </div>
  )
}
