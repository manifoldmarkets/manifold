import { Lover } from 'common/love/lover'
import { Subtitle } from '../widgets/lover-subtitle'
import { Col } from 'web/components/layout/col'
import {
  Content,
  TextEditor,
  useTextEditor,
} from 'web/components/widgets/editor'
import { JSONContent } from '@tiptap/core'
import { Button } from 'web/components/buttons/button'
import { useState } from 'react'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { Row } from 'web/components/layout/row'
import { updateLover } from 'web/lib/firebase/love/api'
import { track } from 'web/lib/service/analytics'
import { User } from 'common/user'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { PencilIcon } from '@heroicons/react/outline'
import { XIcon } from '@heroicons/react/outline'
import { EditableBio } from './editable-bio'

export function BioBlock(props: {
  isCurrentUser: boolean
  lover: Lover
  refreshLover: () => void
}) {
  const { isCurrentUser, refreshLover, lover } = props
  const [edit, setEdit] = useState(false)

  return (
    <Col
      className={
        'bg-canvas-0 flex-grow whitespace-pre-line rounded-md px-3 py-2 leading-relaxed'
      }
    >
      <Row className="w-full">
        {!edit && (
          <Content
            className="flex flex-grow"
            content={lover.bio as JSONContent}
          />
        )}
        {edit && (
          <EditableBio
            lover={lover}
            onCancel={() => setEdit(false)}
            onSave={() => {
              refreshLover()
              setEdit(false)
            }}
          />
        )}
        {isCurrentUser && !edit && (
          <DropdownMenu
            items={[
              {
                name: 'Edit',
                icon: <PencilIcon className="h-5 w-5" />,
                onClick: () => setEdit(true),
              },
              {
                name: 'Delete',
                icon: <XIcon className="h-5 w-5" />,
                onClick: async () => {
                  await updateLover({
                    ...lover,
                    bio: null,
                  }).catch((e) => {
                    console.error(e)
                    return false
                  })
                  refreshLover()
                },
              },
            ]}
            closeOnClick
          />
        )}
      </Row>
    </Col>
  )
}
