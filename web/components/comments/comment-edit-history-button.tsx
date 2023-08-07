import { Comment } from 'common/comment'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { useEffect, useState } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Row } from 'web/components/layout/row'
import { Content } from 'web/components/widgets/editor'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

type EditHistory = Comment & {
  editCreatedTime: number
}
export const CommentEditHistoryButton = (props: { comment: Comment }) => {
  const { comment } = props
  const [showEditHistory, setShowEditHistory] = useState(false)
  const [edits, setEdits] = useState<EditHistory[] | undefined>(undefined)

  const loadEdits = async () => {
    const { data } = await run(
      db
        .from('contract_comment_edits')
        .select('*')
        .eq('comment_id', comment.id)
        .order('created_time', { ascending: false })
    )

    const comments = data.map((edit) => {
      const comment = edit.data as Comment
      return {
        ...comment,
        editCreatedTime: new Date(edit.created_time).valueOf(),
      }
    })

    setEdits(comments)
  }

  useEffect(() => {
    if (showEditHistory && edits === undefined) {
      loadEdits()
    }
  }, [showEditHistory])

  if (!comment.editedTime) return null

  return (
    <>
      <span
        className={' text-ink-400 ml-1 cursor-pointer text-xs hover:underline'}
        onClick={() => setShowEditHistory(true)}
      >
        (edited)
      </span>
      <Modal size={'md'} open={showEditHistory} setOpen={setShowEditHistory}>
        <Col className={'bg-canvas-100 p-4'}>
          <Title children={'Edit history'} />
          {!edits ? (
            <LoadingIndicator />
          ) : (
            edits.map((edit, index) => (
              <Col
                className={
                  'text-ink-500 bg-canvas-50 my-2 gap-2 rounded-md p-2'
                }
              >
                <Row>
                  Edit {'#' + (edits?.length - index)} (
                  <RelativeTimestamp
                    className={'-ml-1'}
                    time={edit.editCreatedTime}
                  />
                  )
                </Row>
                <Row>
                  <Content
                    size="sm"
                    className="mt-1 grow"
                    content={edit.content || edit.text}
                  />
                </Row>
              </Col>
            ))
          )}
        </Col>
      </Modal>
    </>
  )
}
