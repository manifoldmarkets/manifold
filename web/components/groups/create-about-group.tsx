import { CheckIcon } from '@heroicons/react/solid'
import { Group } from 'common/group'
import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import { TextEditor, useTextEditor } from '../widgets/editor'
import { savePost } from './group-overview-post'

export function CreateAboutGroupModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  group: Group
}) {
  const { open, setOpen, group } = props
  const editor = useTextEditor({
    key: `about ${group.id}`,
    size: 'lg',
    placeholder: 'Tell us what your group is about',
  })
  const [loading, setLoading] = useState(false)

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={MODAL_CLASS}>
        <div className="text-xl">About {group.name}</div>
        <TextEditor editor={editor} />
        <Spacer h={2} />
        <Row className="w-full justify-end gap-2">
          <Button color="gray" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            loading={loading}
            onClick={async () => {
              setLoading(true)
              await savePost(editor, group, null)
              toast('About section created!', {
                icon: <CheckIcon className={'h-5 w-5 text-teal-500'} />,
              })
              setOpen(false)
            }}
          >
            Save
          </Button>
        </Row>
      </Col>
    </Modal>
  )
}
