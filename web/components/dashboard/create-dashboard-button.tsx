import { useState } from 'react'
import { Button } from '../buttons/button'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { ExpandingInput } from '../widgets/expanding-input'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import clsx from 'clsx'
import { Col } from '../layout/col'
import { TextEditor, useTextEditor } from '../widgets/editor'
import { MAX_DESCRIPTION_LENGTH } from 'common/contract'

export function CreateDashboardButton() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = usePersistentLocalState(
    '',
    'create dashboard title'
  )

  const editor = useTextEditor({
    key: 'create dashbord dsecription',
    max: MAX_DESCRIPTION_LENGTH,
    placeholder: 'Optional. Provide background info and details.',
  })

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true)
        }}
      >
        Create Dashboard
      </Button>
      <Modal open={open} setOpen={setOpen}>
        <div className={MODAL_CLASS}>
          <Col>
            <label className="px-1 pt-2 pb-3">
              Title<span className={'text-scarlet-500'}>*</span>
            </label>

            <ExpandingInput
              placeholder={'Dashboard Title'}
              autoFocus
              maxLength={150}
              value={title}
              onChange={(e) => setTitle(e.target.value || '')}
            />
          </Col>
          <Col>
            <label className="gap-2 px-1 py-2">
              <span className="mb-1">Description</span>
            </label>
            <TextEditor editor={editor} />
          </Col>
        </div>
      </Modal>
    </>
  )
}
