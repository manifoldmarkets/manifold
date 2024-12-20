import { ContractComment } from 'common/comment'
import { Col } from 'components/layout/col'
import { useEvent } from 'hooks/useEvent'
import { ReactNode, useState } from 'react'
import { ParentComment } from './ParentComment'
import { Comment } from './Comment'
import {
  Modal as RNModal,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native'
import { Colors } from 'constants/Colors'

export function CommentThread({
  parentComment,
  threadComments,
}: {
  parentComment: ContractComment
  threadComments: ContractComment[]
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const onOpenModal = useEvent(() => setIsModalOpen(true))
  const onCloseModal = useEvent(() => setIsModalOpen(false))

  return (
    <Col>
      <TouchableOpacity onPress={onOpenModal}>
        <ParentComment
          comment={parentComment}
          numReplies={threadComments.length}
        />
      </TouchableOpacity>

      <Modal isOpen={isModalOpen} onClose={onCloseModal}>
        <ParentComment
          comment={parentComment}
          numReplies={threadComments.length}
        />
        <Col>
          {threadComments.map((comment) => (
            <Comment key={comment.id} comment={comment} />
          ))}
        </Col>
      </Modal>
    </Col>
  )
}

type ModalProps = {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
}

export function Modal({ isOpen, onClose, children }: ModalProps) {
  return (
    <RNModal
      visible={isOpen}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.content}>{children}</SafeAreaView>
    </RNModal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'flex-end',
  },
  content: {
    // backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '80%',
  },
})
