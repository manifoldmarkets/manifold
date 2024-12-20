import { ContractComment } from 'common/comment'
import { ThemedText } from 'components/ThemedText'
import { Comment } from './Comment'
export function ParentComment({
  comment,
  numReplies,
  onPress,
}: {
  comment: ContractComment
  numReplies: number
}) {
  return (
    <Comment comment={comment} isParent>
      {/* TODO: Implement ReplyToggle */}
      <ThemedText>Prent Reply</ThemedText>
    </Comment>
  )
}
