import { Contract } from 'common/contract'
import { Comment } from 'common/comment'
import { useTextEditor } from 'web/components/widgets/editor'
import { MAX_COMMENT_LENGTH } from 'common/comment'
import { Col } from 'web/components/layout/col'
import { CommentInputTextArea } from 'web/components/comments/comment-input'
import { Modal } from 'web/components/layout/modal'
import { useEffect, useState } from 'react'
import { User } from 'common/user'
import { safeLocalStorage } from 'web/lib/util/local'
import { getApiUrl } from 'common/api'
import { call } from 'web/lib/firebase/api'
import { Title } from 'web/components/widgets/title'

export const EditCommentModal = (props: {
  comment: Comment
  contract: Contract
  open: boolean
  setOpen: (open: boolean) => void
  user: User
}) => {
  const key = `edit comment ${props.comment.id}`
  const { comment, user, contract, open, setOpen } = props
  const [isSubmitting, setIsSubmitting] = useState(false)
  const editor = useTextEditor({
    key,
    size: 'sm',
    max: MAX_COMMENT_LENGTH,
    defaultValue: comment.content,
  })
  useEffect(() => {
    editor?.commands.focus('end')
  }, [editor])
  const submitComment = async () => {
    if (!editor || editor.isEmpty || isSubmitting) return
    setIsSubmitting(true)
    editor.commands.focus('end')
    // if last item is text, try to linkify it by adding and deleting a space
    if (editor.state.selection.empty) {
      editor.commands.insertContent(' ')
      const endPos = editor.state.selection.from
      editor.commands.deleteRange({ from: endPos - 1, to: endPos })
    }
    await call(getApiUrl('editcomment'), 'POST', {
      commentId: comment.id,
      content: editor.getJSON(),
      contractId: contract.id,
    })

    setIsSubmitting(false)
    editor.commands.clearContent(true)
    // force clear save, because it can fail if editor unrenders
    safeLocalStorage?.removeItem(`text ${key}`)
    setOpen(false)
  }

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={'bg-canvas-50 rounded-md p-4'}>
        <Title children={'Edit Comment'} />
        <CommentInputTextArea
          editor={editor}
          user={user}
          submit={submitComment}
          isSubmitting={isSubmitting}
        />
      </Col>
    </Modal>
  )
}
