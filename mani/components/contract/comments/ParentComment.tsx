import { ContractComment } from 'common/comment'
import { ThemedText } from 'components/ThemedText'
import { Comment } from './Comment'
export function ParentComment({
  comment,
  seeReplies,
  numReplies,
}: {
  comment: ContractComment
  seeReplies: boolean
  numReplies: number
}) {
  return (
    <Comment
      comment={comment}
      isParent
      showParentLine={seeReplies && numReplies > 0}
    >
      {/* TODO: Implement ReplyToggle */}
      <ThemedText>Prent Reply</ThemedText>
    </Comment>
  )
}
