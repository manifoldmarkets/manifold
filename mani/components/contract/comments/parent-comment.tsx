import { ContractComment } from 'common/comment'
import { Col } from 'components/layout/col'
import { useEvent } from 'hooks/use-event'
import { useState } from 'react'
import { Comment } from './comment'
import { TouchableOpacity } from 'react-native'
import { Modal } from 'components/layout/modal'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/useColor'

export function ParentComment({
  parentComment,
  threadComments,
}: {
  parentComment: ContractComment
  threadComments: ContractComment[]
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const onOpenModal = useEvent(() => setIsModalOpen(true))
  const onCloseModal = useEvent(() => setIsModalOpen(false))
  const numReplies = threadComments.length
  const color = useColor()

  return (
    <Col>
      <Comment
        comment={parentComment}
        replyButton={
          <TouchableOpacity onPress={onOpenModal}>
            <ThemedText size="md" color={color.textTertiary}>
              {numReplies
                ? `${numReplies} ${numReplies > 1 ? 'replies' : 'reply'}`
                : 'Reply'}
            </ThemedText>
          </TouchableOpacity>
        }
      />
      {/* TODO: add reply input to modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={onCloseModal}
        mode="back"
        title="Replies"
      >
        <Comment comment={parentComment} line={numReplies > 0} />
        <Col>
          {threadComments.map((comment, i) => (
            <Comment
              key={comment.id}
              comment={comment}
              line={i !== numReplies - 1}
            />
          ))}
        </Col>
      </Modal>
    </Col>
  )
}
